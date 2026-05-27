import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  currentPassword: z.string().min(1, "Indica tu contraseña actual."),
  newPassword: z.string().min(1, "Indica la nueva contraseña."),
});

/**
 * Cambio de contraseña iniciado por el propio usuario.
 * Requiere sesión válida y conocer la contraseña actual.
 */
export async function POST(request: Request) {
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

    const strength = validatePasswordStrength(parsed.data.newPassword);
    if (!strength.ok) {
      return NextResponse.json({ message: strength.message }, { status: 400 });
    }

    if (parsed.data.currentPassword === parsed.data.newPassword) {
      return NextResponse.json(
        { message: "La nueva contraseña debe ser distinta de la actual." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, name: true, email: true, passwordHash: true, mustChangePassword: true },
    });
    if (!user) {
      return NextResponse.json({ message: "Usuario no encontrado" }, { status: 404 });
    }

    const matches = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!matches) {
      await writeAuditEvent({
        userId: user.id,
        action: "auth.change_password_failed",
        detail: `Intento fallido (contraseña actual incorrecta) ${user.email}`,
      });
      return NextResponse.json({ message: "La contraseña actual no es correcta." }, { status: 401 });
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      },
    });

    await writeAuditEvent({
      userId: user.id,
      action: "auth.change_password",
      detail: `${user.name} cambio su contraseña`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error changing password:", error);
    return NextResponse.json({ message: "No se pudo cambiar la contraseña" }, { status: 500 });
  }
}
