import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

// Acepta URL absoluta http/https o ruta interna /uploads/(avatars|banners)/...
// Esto evita esquemas peligrosos como javascript: y mantiene la UI a salvo.
const imageUrlSchema = z
  .string()
  .trim()
  .max(2000, "URL demasiado larga.")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .refine(
    (value) =>
      value === null ||
      /^https?:\/\//i.test(value) ||
      /^\/uploads\/(avatars|banners)\/[a-zA-Z0-9_.\-]+$/.test(value),
    {
      message: "Indica una URL http(s) o súbela desde el botón.",
    },
  );

const bodySchema = z.object({
  name: z.string().trim().min(1, "El nombre no puede estar vacío.").max(80, "Máximo 80 caracteres.").optional(),
  bio: z
    .string()
    .max(280, "La biografía es de máximo 280 caracteres.")
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === null || value.trim() === "" ? null : value.trim())),
  position: z
    .string()
    .max(60, "Máximo 60 caracteres.")
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === null || value.trim() === "" ? null : value.trim())),
  phone: z
    .string()
    .max(30, "Máximo 30 caracteres.")
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === null || value.trim() === "" ? null : value.trim())),
  avatarUrl: imageUrlSchema.optional(),
  bannerUrl: imageUrlSchema.optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Sesion requerida" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        bannerUrl: true,
        bio: true,
        position: true,
        phone: true,
        lastLoginAt: true,
        mustChangePassword: true,
        passwordUpdatedAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ message: "Usuario no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error reading account profile:", error);
    return NextResponse.json({ message: "No se pudo leer el perfil" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Sesion requerida" }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Datos invalidos", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    const changedFields: string[] = [];
    if (parsed.data.name !== undefined) {
      data.name = parsed.data.name;
      changedFields.push("nombre");
    }
    if (parsed.data.bio !== undefined) {
      data.bio = parsed.data.bio;
      changedFields.push("bio");
    }
    if (parsed.data.position !== undefined) {
      data.position = parsed.data.position;
      changedFields.push("puesto");
    }
    if (parsed.data.phone !== undefined) {
      data.phone = parsed.data.phone;
      changedFields.push("teléfono");
    }
    if (parsed.data.avatarUrl !== undefined) {
      data.avatarUrl = parsed.data.avatarUrl;
      changedFields.push("avatar");
    }
    if (parsed.data.bannerUrl !== undefined) {
      data.bannerUrl = parsed.data.bannerUrl;
      changedFields.push("banner");
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true, user: null, message: "Nada que actualizar" });
    }

    const updated = await prisma.user.update({
      where: { id: actor.userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        bannerUrl: true,
        bio: true,
        position: true,
        phone: true,
      },
    });

    await writeAuditEvent({
      userId: updated.id,
      action: "account.update",
      detail: `${updated.name} actualizó su perfil (${changedFields.join(", ")})`,
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (error) {
    console.error("Error updating account profile:", error);
    return NextResponse.json({ message: "No se pudo actualizar el perfil" }, { status: 500 });
  }
}
