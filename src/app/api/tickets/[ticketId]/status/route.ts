import { NextResponse } from "next/server";
import { z } from "zod";

import type { TicketStatus } from "@/lib/domain";
import { consumeReservedPartsForTicket } from "@/lib/inventory";
import { notifyTicketExternally } from "@/lib/external-notifications";
import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canUpdateTicketStatus, getAllowedTransitions } from "@/lib/rbac";

const statusUpdateSchema = z.object({
  nextStatus: z.enum(["abierto", "en_proceso", "esperando_repuesto", "resuelto"]),
  comment: z.string().trim().min(3),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para cambiar estados" }, { status: 401 });
    }
    if (!canUpdateTicketStatus(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para actualizar estado" }, { status: 403 });
    }

    const { ticketId } = await context.params;
    const payload = await request.json();
    const parsed = statusUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Estado de destino invalido" }, { status: 400 });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true, busId: true, title: true },
    });
    if (!ticket) {
      return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
    }

    const allowed = getAllowedTransitions(actor.role, ticket.status as TicketStatus);
    if (!allowed.includes(parsed.data.nextStatus)) {
      return NextResponse.json(
        { message: "Transicion no permitida para el rol actual", allowedTransitions: allowed },
        { status: 403 },
      );
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: parsed.data.nextStatus },
    });

    let consumedCount = 0;
    if (parsed.data.nextStatus === "resuelto") {
      const consumed = await consumeReservedPartsForTicket(ticket.id);
      consumedCount = consumed.consumedCount;
    }

    await prisma.ticketComment.create({
      data: {
        ticketId: ticket.id,
        author: actor.displayName,
        body: `Cambio de estado ${ticket.status} -> ${parsed.data.nextStatus}. Comentario: ${parsed.data.comment}`,
      },
    });

    await writeAuditEvent({
      userId: actor.userId,
      ticketId: ticket.id,
      action: "ticket.status_changed",
      detail: `${ticket.status} -> ${parsed.data.nextStatus} por ${actor.displayName}. ${parsed.data.comment}${consumedCount > 0 ? ` · repuestos consumidos: ${consumedCount}` : ""}`,
    });

    if (parsed.data.nextStatus === "resuelto") {
      notifyTicketExternally({
        kind: "ticket_resolved",
        ticketId: ticket.id,
        title: ticket.title,
        busId: ticket.busId,
      });
    }

    return NextResponse.json({
      ok: true,
      ticketId: ticket.id,
      nextStatus: parsed.data.nextStatus,
      inventory: { consumedReservations: consumedCount },
    });
  } catch (error) {
    console.error("Error updating ticket status:", error);
    return NextResponse.json({ message: "No se pudo actualizar el estado" }, { status: 500 });
  }
}
