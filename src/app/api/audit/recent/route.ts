import { NextResponse } from "next/server";

import { isApiAuthError, requireActor } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (isApiAuthError(actor)) return actor;

    const events = await prisma.auditEvent.findMany({
      include: {
        user: {
          select: { name: true, role: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
    });

    return NextResponse.json({
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        detail: event.detail,
        ticketId: event.ticketId,
        createdAt: event.createdAt.toISOString(),
        actor: event.user?.name ?? "Sistema",
        actorRole: event.user?.role ?? null,
      })),
    });
  } catch (error) {
    console.error("Error loading audit events:", error);
    return NextResponse.json({ message: "No se pudo cargar auditoría" }, { status: 500 });
  }
}
