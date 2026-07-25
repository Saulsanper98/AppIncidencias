import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canRequestTicketDeletion } from "@/lib/rbac";
import { isTicketOwnedByActor } from "@/lib/ticket-ownership";
import { sseBus } from "@/lib/sse-bus";

const requestSchema = z.object({
  reason: z.string().trim().min(5, "Motivo demasiado corto (mínimo 5 caracteres)").max(500),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }
    if (!canRequestTicketDeletion(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para solicitar borrado" }, { status: 403 });
    }

    const { ticketId } = await context.params;
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Datos inválidos";
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, title: true, busId: true, assignedToUserId: true, createdByUserId: true },
    });
    if (!ticket) {
      return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
    }
    if (!isTicketOwnedByActor(ticket, actor.userId)) {
      return NextResponse.json(
        { message: "Solo puedes solicitar borrado de tickets asignados a ti o creados por ti" },
        { status: 403 },
      );
    }

    const pending = await prisma.ticketDeletionRequest.findFirst({
      where: { ticketId, status: "pendiente" },
      select: { id: true },
    });
    if (pending) {
      return NextResponse.json(
        { message: "Ya hay una solicitud de borrado pendiente para este ticket" },
        { status: 409 },
      );
    }

    const created = await prisma.ticketDeletionRequest.create({
      data: {
        ticketId,
        requestedByUserId: actor.userId,
        reason: parsed.data.reason,
      },
      include: {
        requestedBy: { select: { name: true } },
      },
    });

    const shortId = ticket.id.slice(-8).toUpperCase();
    await writeAuditEvent({
      userId: actor.userId,
      ticketId: ticket.id,
      action: "ticket.deletion_requested",
      detail: `${actor.displayName} solicitó borrar el ticket ${shortId} (bus ${ticket.busId}, "${ticket.title}"). Motivo: ${parsed.data.reason}`,
    });

    sseBus.publish("ticket_deletion_requested", {
      id: ticket.id,
      busId: ticket.busId,
      title: ticket.title,
      by: actor.displayName,
      requestId: created.id,
    });

    return NextResponse.json({
      ok: true,
      request: {
        id: created.id,
        ticketId: created.ticketId,
        reason: created.reason,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
        requestedByName: created.requestedBy.name,
      },
    });
  } catch (error) {
    console.error("Error creating ticket deletion request:", error);
    return NextResponse.json({ message: "No se pudo registrar la solicitud" }, { status: 500 });
  }
}
