import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canReviewTicketDeletion } from "@/lib/rbac";
import { deleteTicketWithAudit } from "@/lib/ticket-delete";
import { sseBus } from "@/lib/sse-bus";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }
    if (!canReviewTicketDeletion(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para revisar solicitudes" }, { status: 403 });
    }

    const { requestId } = await context.params;
    const parsed = reviewSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }

    const deletionRequest = await prisma.ticketDeletionRequest.findUnique({
      where: { id: requestId },
      include: {
        ticket: { select: { id: true, title: true, busId: true, status: true } },
        requestedBy: { select: { name: true } },
      },
    });
    if (!deletionRequest) {
      return NextResponse.json({ message: "Solicitud no encontrada" }, { status: 404 });
    }
    if (deletionRequest.status !== "pendiente") {
      return NextResponse.json({ message: "Esta solicitud ya fue revisada" }, { status: 409 });
    }

    const now = new Date();
    const reviewNote = parsed.data.note?.trim() || null;

    if (parsed.data.action === "reject") {
      await prisma.ticketDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: "rechazada",
          reviewedByUserId: actor.userId,
          reviewedAt: now,
          reviewNote,
        },
      });

      await writeAuditEvent({
        userId: actor.userId,
        ticketId: deletionRequest.ticketId,
        action: "ticket.deletion_rejected",
        detail: `${actor.displayName} rechazó la solicitud de borrado de ${deletionRequest.requestedBy.name}. Motivo original: ${deletionRequest.reason}${reviewNote ? `. Nota: ${reviewNote}` : ""}`,
      });

      sseBus.publish("ticket_deletion_rejected", {
        id: deletionRequest.ticketId,
        requestId,
        by: actor.displayName,
      });

      return NextResponse.json({ ok: true, status: "rechazada" });
    }

    if (!deletionRequest.ticket) {
      await prisma.ticketDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: "aprobada",
          reviewedByUserId: actor.userId,
          reviewedAt: now,
          reviewNote,
        },
      });
      return NextResponse.json({ ok: true, status: "aprobada", ticketAlreadyGone: true });
    }

    const combinedReason = `Solicitud de ${deletionRequest.requestedBy.name}: ${deletionRequest.reason}${reviewNote ? ` | Nota gestor: ${reviewNote}` : ""}`;

    await deleteTicketWithAudit({
      ticketId: deletionRequest.ticketId,
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      reason: combinedReason,
      auditPrefix: "Aprobó solicitud de borrado.",
    });

    await prisma.ticketDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: "aprobada",
        reviewedByUserId: actor.userId,
        reviewedAt: now,
        reviewNote,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "aprobada",
      deletedId: deletionRequest.ticketId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TICKET_NOT_FOUND") {
      return NextResponse.json({ message: "El ticket ya no existe" }, { status: 404 });
    }
    console.error("Error reviewing deletion request:", error);
    return NextResponse.json({ message: "No se pudo procesar la solicitud" }, { status: 500 });
  }
}
