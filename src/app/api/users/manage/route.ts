import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import {
  generateTemporaryPassword,
  hashPassword,
  validatePasswordStrength,
} from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/rbac";

const ROLE_VALUES = ["conductor", "tecnico_campo", "gestor_centro_control"] as const;

const nameSchema = z
  .string()
  .min(3, "El nombre debe tener al menos 3 caracteres.")
  .max(120, "El nombre es demasiado largo.")
  .transform((v) => v.trim())
  .refine((v) => v.length >= 3, { message: "El nombre debe tener al menos 3 caracteres." });

const emailSchema = z
  .string()
  .email("Correo electrónico inválido.")
  .max(180, "El correo es demasiado largo.")
  .transform((v) => v.toLowerCase().trim());

/**
 * - Si `password` viene, se hashea y se usa como contraseña inicial.
 * - Si no viene, el endpoint genera una contraseña temporal aleatoria y la
 *   devuelve UNA SOLA VEZ en la respuesta para que el administrador la
 *   entregue al usuario por canal externo.
 * - `mustChangePassword` por defecto es `true` salvo que se indique lo
 *   contrario (p. ej. cuando el propio administrador establece la suya).
 */
const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: z.enum(ROLE_VALUES),
  password: z.string().min(1).max(200).optional(),
  mustChangePassword: z.boolean().optional(),
});

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  role: z.enum(ROLE_VALUES).optional(),
  isActive: z.boolean().optional(),
});

function isGestorRole(role: string) {
  return role === "gestor_centro_control";
}

async function countActiveGestors() {
  return prisma.user.count({
    where: { role: "gestor_centro_control", isActive: true },
  });
}

/** Filas de usuario para el panel; tolera BD sin migrar `updatedAt`/`lastLoginAt` (usa `createdAt`). */
async function findManagedUserRows() {
  try {
    return await prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        mustChangePassword: true,
        passwordHash: true,
        lastLoginAt: true,
      },
    });
  } catch (e) {
    console.warn("[users/manage] findMany con campos extendidos falló, reintentando minimal:", e);
    const rows = await prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      updatedAt: r.createdAt,
      mustChangePassword: false,
      passwordHash: null,
      lastLoginAt: null,
    }));
  }
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageUsers(actor.role)) {
      return NextResponse.json({ message: "Permisos insuficientes" }, { status: 403 });
    }

    const users = await findManagedUserRows();

    const [total, active, gestorsActive] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      countActiveGestors(),
    ]);

    return NextResponse.json({
      actorId: actor.userId,
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        hasPassword: Boolean(user.passwordHash),
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      })),
      stats: {
        total,
        active,
        inactive: total - active,
        gestorsActive,
      },
    });
  } catch (error) {
    console.error("Error loading managed users:", error);
    const debug =
      process.env.NODE_ENV === "development" && error instanceof Error ? { debug: error.message } : {};
    return NextResponse.json(
      { message: "No se pudo cargar usuarios para gestion", ...debug },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageUsers(actor.role)) {
      return NextResponse.json({ message: "Permisos insuficientes" }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = createUserSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Datos de usuario invalidos", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    let initialPassword = parsed.data.password ?? null;
    let passwordWasGenerated = false;
    if (initialPassword) {
      const strength = validatePasswordStrength(initialPassword);
      if (!strength.ok) {
        return NextResponse.json({ message: strength.message }, { status: 400 });
      }
    } else {
      initialPassword = generateTemporaryPassword();
      passwordWasGenerated = true;
    }

    const passwordHash = await hashPassword(initialPassword);
    // Si el admin no pidió lo contrario, exigimos cambio al primer login.
    const mustChangePassword = parsed.data.mustChangePassword ?? true;

    const created = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        isActive: true,
        passwordHash,
        mustChangePassword,
        passwordUpdatedAt: new Date(),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true },
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "user.created",
      detail: `${actor.displayName} creo usuario ${created.email} (${created.role})`,
    });

    // Devolvemos la contraseña al admin SOLO si fue autogenerada (para que la
    // pueda comunicar al usuario por canal externo). Si la introdujo el propio
    // admin, no la repetimos por consola/log de UI.
    return NextResponse.json(
      {
        user: created,
        initialPassword: passwordWasGenerated ? initialPassword : null,
        passwordWasGenerated,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "Ya existe un usuario con ese correo electronico." }, { status: 409 });
    }
    console.error("Error creating user:", error);
    return NextResponse.json({ message: "No se pudo crear usuario" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageUsers(actor.role)) {
      return NextResponse.json({ message: "Permisos insuficientes" }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = updateUserSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Datos de actualización invalidos", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const hasChanges =
      parsed.data.role !== undefined ||
      parsed.data.isActive !== undefined ||
      parsed.data.name !== undefined ||
      parsed.data.email !== undefined;
    if (!hasChanges) {
      return NextResponse.json({ message: "Nada que actualizar" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, role: true, isActive: true, email: true, name: true },
    });
    if (!target) {
      return NextResponse.json({ message: "Usuario no encontrado" }, { status: 404 });
    }

    const nextRole = parsed.data.role !== undefined ? parsed.data.role : target.role;
    const nextActive = parsed.data.isActive !== undefined ? parsed.data.isActive : target.isActive;

    if (target.id === actor.userId && nextActive === false) {
      return NextResponse.json(
        { message: "No puedes desactivar tu propia cuenta desde la administracion." },
        { status: 400 },
      );
    }
    if (target.id === actor.userId && parsed.data.role !== undefined && parsed.data.role !== target.role) {
      return NextResponse.json(
        { message: "No puedes cambiar tu propio rol desde la administracion." },
        { status: 400 },
      );
    }

    const wasContributingGestor = target.isActive && isGestorRole(target.role);
    const willContributeGestor = nextActive && isGestorRole(nextRole);
    if (wasContributingGestor && !willContributeGestor) {
      const gestors = await countActiveGestors();
      if (gestors <= 1) {
        return NextResponse.json(
          { message: "Debe existir al menos un gestor del centro de control activo." },
          { status: 400 },
        );
      }
    }

    const data: {
      role?: (typeof parsed.data)["role"];
      isActive?: boolean;
      name?: string;
      email?: string;
    } = {};
    if (parsed.data.role !== undefined) data.role = parsed.data.role;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.email !== undefined) data.email = parsed.data.email;

    const updated = await prisma.user.update({
      where: { id: parsed.data.userId },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true, updatedAt: true },
    });

    const changedFields: string[] = [];
    if (parsed.data.name !== undefined && parsed.data.name !== target.name) changedFields.push("nombre");
    if (parsed.data.email !== undefined && parsed.data.email !== target.email) changedFields.push("email");
    if (parsed.data.role !== undefined && parsed.data.role !== target.role) changedFields.push("rol");
    if (parsed.data.isActive !== undefined && parsed.data.isActive !== target.isActive)
      changedFields.push(parsed.data.isActive ? "reactivado" : "desactivado");

    await writeAuditEvent({
      userId: actor.userId,
      action: "user.updated",
      detail: `${actor.displayName} actualizo usuario ${updated.email}${
        changedFields.length ? ` (${changedFields.join(", ")})` : ""
      }`,
    });

    return NextResponse.json({
      user: { ...updated, updatedAt: updated.updatedAt.toISOString() },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "Ya existe un usuario con ese correo electronico." }, { status: 409 });
    }
    console.error("Error updating user:", error);
    return NextResponse.json({ message: "No se pudo actualizar usuario" }, { status: 500 });
  }
}

const deleteSchema = z.object({ userId: z.string().min(1) });

export async function DELETE(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageUsers(actor.role)) {
      return NextResponse.json({ message: "Permisos insuficientes" }, { status: 403 });
    }

    const payload = await request.json().catch(() => ({}));
    const parsed = deleteSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "userId invalido" }, { status: 400 });
    }

    if (parsed.data.userId === actor.userId) {
      return NextResponse.json(
        { message: "No puedes eliminar tu propia cuenta desde la administracion." },
        { status: 400 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!target) {
      return NextResponse.json({ message: "Usuario no encontrado" }, { status: 404 });
    }

    // Salvaguarda: no se puede dejar el sistema sin ningún gestor activo.
    if (target.isActive && isGestorRole(target.role)) {
      const gestors = await countActiveGestors();
      if (gestors <= 1) {
        return NextResponse.json(
          { message: "Debe existir al menos un gestor del centro de control activo." },
          { status: 400 },
        );
      }
    }

    await prisma.user.delete({ where: { id: target.id } });

    await writeAuditEvent({
      userId: actor.userId,
      action: "user.deleted",
      detail: `${actor.displayName} elimino usuario ${target.email} (${target.role})`,
    });

    return NextResponse.json({ ok: true, deleted: { id: target.id, email: target.email } });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ message: "No se pudo eliminar usuario" }, { status: 500 });
  }
}
