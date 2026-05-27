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

const bodySchema = z.object({
  userId: z.string().min(1),
  /** Si no se proporciona, se genera una contraseña temporal aleatoria. */
  newPassword: z.string().min(1).max(200).optional(),
  /** Por defecto true (forzamos cambio en el siguiente login). */
  mustChangePassword: z.boolean().optional(),
});

/**
 * Reset de contraseña por administrador. Genera o establece una contraseña y
 * marca al usuario para cambio obligatorio en el próximo login.
 */
export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageUsers(actor.role)) {
      return NextResponse.json({ message: "Permisos insuficientes" }, { status: 403 });
    }

    const payload = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos invalidos" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ message: "Usuario no encontrado" }, { status: 404 });
    }

    let plain = parsed.data.newPassword ?? null;
    let generated = false;
    if (plain) {
      const strength = validatePasswordStrength(plain);
      if (!strength.ok) {
        return NextResponse.json({ message: strength.message }, { status: 400 });
      }
    } else {
      plain = generateTemporaryPassword();
      generated = true;
    }

    const hash = await hashPassword(plain);
    await prisma.user.update({
      where: { id: target.id },
      data: {
        passwordHash: hash,
        passwordUpdatedAt: new Date(),
        mustChangePassword: parsed.data.mustChangePassword ?? true,
      },
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "user.password_reset",
      detail: `${actor.displayName} reseteo contraseña de ${target.email}`,
    });

    return NextResponse.json({
      ok: true,
      user: { id: target.id, email: target.email, name: target.name },
      // Solo se devuelve si fue autogenerada (para que el admin la comunique al usuario).
      newPassword: generated ? plain : null,
      passwordWasGenerated: generated,
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    return NextResponse.json({ message: "No se pudo restablecer la contraseña" }, { status: 500 });
  }
}
