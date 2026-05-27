import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

/**
 * Marca como "le�das" todas las notificaciones del usuario hasta el instante
 * actual. Guarda un timestamp en `User.notificationsClearedAt` que:
 *   - `GET /api/notifications/list`  usa para filtrar eventos posteriores.
 *   - `GET /api/notifications/stream` usa para calcular el contador `unread`.
 *
 * No borra registros de auditor�a (eso lo decide la pol�tica de retenci�n).
 */
export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }

    const now = new Date();
    await prisma.user.update({
      where: { id: actor.userId },
      data: { notificationsClearedAt: now },
    });

    return NextResponse.json({ ok: true, clearedAt: now.toISOString() });
  } catch (error) {
    console.error("notifications clear:", error);
    return NextResponse.json({ message: "No se pudieron limpiar las notificaciones" }, { status: 500 });
  }
}
