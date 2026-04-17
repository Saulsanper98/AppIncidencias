import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/rbac";

const createUserSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  role: z.enum(["conductor", "tecnico_campo", "gestor_centro_control"]),
});

const updateUserSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["conductor", "tecnico_campo", "gestor_centro_control"]).optional(),
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

/** Filas de usuario para el panel; tolera BD sin migrar `updatedAt` (usa `createdAt`). */
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
      },
    });
  } catch (e) {
    console.warn("[users/manage] findMany con updatedAt falló, reintentando sin columna:", e);
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
    return rows.map((r) => ({ ...r, updatedAt: r.createdAt }));
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
        ...user,
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

    const created = await prisma.user.create({
      data: {
        name: parsed.data.name.trim(),
        email: parsed.data.email.toLowerCase().trim(),
        role: parsed.data.role,
        isActive: true,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "user.created",
      detail: `${actor.displayName} creo usuario ${created.email} (${created.role})`,
    });

    return NextResponse.json({ user: created }, { status: 201 });
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

    if (parsed.data.role === undefined && parsed.data.isActive === undefined) {
      return NextResponse.json({ message: "Nada que actualizar" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, role: true, isActive: true, email: true },
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

    const data: { role?: (typeof parsed.data)["role"]; isActive?: boolean } = {};
    if (parsed.data.role !== undefined) data.role = parsed.data.role;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

    const updated = await prisma.user.update({
      where: { id: parsed.data.userId },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true, updatedAt: true },
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "user.updated",
      detail: `${actor.displayName} actualizo usuario ${updated.email}`,
    });

    return NextResponse.json({
      user: { ...updated, updatedAt: updated.updatedAt.toISOString() },
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ message: "No se pudo actualizar usuario" }, { status: 500 });
  }
}
