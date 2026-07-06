import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canReviewTicketDeletion } from "@/lib/rbac";

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }
    if (!canReviewTicketDeletion(actor.role)) {
      return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "pendiente";

    const requests = await prisma.ticketDeletionRequest.findMany({
      where: { status: status as "pendiente" | "aprobada" | "rechazada" },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: {
        requestedBy: { select: { id: true, name: true } },
        ticket: {
          select: {
            id: true,
            title: true,
            busId: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({
      requests: requests.map((r) => ({
        id: r.id,
        ticketId: r.ticketId,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reviewNote: r.reviewNote,
        requestedBy: r.requestedBy,
        ticket: r.ticket
          ? {
              id: r.ticket.id,
              title: r.ticket.title,
              busId: r.ticket.busId,
              status: r.ticket.status,
              shortId: r.ticket.id.slice(-8).toUpperCase(),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Error listing deletion requests:", error);
    return NextResponse.json({ message: "No se pudieron cargar las solicitudes" }, { status: 500 });
  }
}
