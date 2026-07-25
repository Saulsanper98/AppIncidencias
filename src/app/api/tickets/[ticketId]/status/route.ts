import { NextResponse } from "next/server";
import { z } from "zod";

import type { TicketStatus } from "@/lib/domain";
import { consumeReservedPartsForTicket } from "@/lib/inventory";
import { notifyTicketExternally } from "@/lib/external-notifications";
import { renderTicketEmail, sendUserEmail } from "@/lib/email-notifications";
import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canUpdateTicketStatus, getAllowedTransitions } from "@/lib/rbac";
import { recordTicketStatusChange } from "@/lib/ticket-status-history";
import { notifyTicketWatchers } from "@/lib/ticket-watchers";
import { publishTicketEvent } from "@/lib/tickets-events";
import { trackTicketResolvedTelemetry } from "@/lib/ticket-resolution-telemetry";
import { trackServerUxEvent } from "@/lib/ux-server";

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
    if (!canUpdateTicketStatus(actor.role, actor.isReadOnly)) {
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
      select: {
        id: true,
        status: true,
        busId: true,
        title: true,
        priority: true,
        assignedToUserId: true,
        createdAt: true,
        slaDeadline: true,
        tipo: true,
      },
    });
    if (!ticket) {
      return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
    }

    const allowed = getAllowedTransitions(actor.role, ticket.status as TicketStatus, actor.isReadOnly);
    if (!allowed.includes(parsed.data.nextStatus)) {
      return NextResponse.json(
        { message: "Transicion no permitida para el rol actual", allowedTransitions: allowed },
        { status: 403 },
      );
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: parsed.data.nextStatus,
        ...(parsed.data.nextStatus === "resuelto" ? { resolvedAt: new Date() } : { resolvedAt: null }),
      },
    });

    await recordTicketStatusChange({
      ticketId: ticket.id,
      fromStatus: ticket.status as TicketStatus,
      toStatus: parsed.data.nextStatus,
      changedByUserId: actor.userId,
      changedByName: actor.displayName,
      comment: parsed.data.comment,
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

    publishTicketEvent("ticket_status_changed", {
      id: ticket.id,
      busId: ticket.busId,
      status: parsed.data.nextStatus,
      previousStatus: ticket.status,
      priority: ticket.priority,
      title: ticket.title,
      assignedToUserId: ticket.assignedToUserId,
      by: actor.displayName,
    });

    void notifyTicketWatchers({
      ticketId: ticket.id,
      busId: ticket.busId,
      title: ticket.title,
      priority: ticket.priority,
      status: parsed.data.nextStatus,
      headline: `Estado → ${parsed.data.nextStatus}`,
      bodyHtml: `${actor.displayName} actualizó el ticket.<br/><em>${parsed.data.comment.replace(/[<>]/g, "")}</em>`,
      actorUserId: actor.userId,
      dedupeKey: `watch-status:${ticket.id}:${parsed.data.nextStatus}:${actor.userId}`,
    });

    // Aviso por email al asignado cuando alguien distinto cambia el estado.
    // Si el ticket no está asignado o lo cambia el propio asignado, no
    // mandamos nada para no hacer spam.
    if (
      ticket.assignedToUserId &&
      ticket.assignedToUserId !== actor.userId
    ) {
      const { subject, html } = renderTicketEmail({
        headline: `Estado actualizado a "${parsed.data.nextStatus}"`,
        body: `${actor.displayName} ha cambiado el estado del ticket de <strong>${ticket.status}</strong> a <strong>${parsed.data.nextStatus}</strong>.<br/><br/>Comentario:<br/><em>${parsed.data.comment.replace(/[<>]/g, "")}</em>`,
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        busId: ticket.busId,
        status: parsed.data.nextStatus,
        priority: ticket.priority,
        actor: actor.displayName,
      });
      void sendUserEmail({
        userIds: [ticket.assignedToUserId],
        subject,
        html,
        dedupeKey: `status:${ticket.id}:${parsed.data.nextStatus}:${actor.userId}`,
      });
    }

    // ── Telemetría UX (servidor) ─────────────────────────────────────────
    const now = new Date();
    if (parsed.data.nextStatus === "resuelto") {
      trackTicketResolvedTelemetry({
        actor: { userId: actor.userId, role: actor.role },
        request,
        ticketId: ticket.id,
        busId: ticket.busId,
        fromStatus: ticket.status as TicketStatus,
        createdAt: ticket.createdAt,
        resolvedAt: now,
        slaDeadline: ticket.slaDeadline,
        priority: ticket.priority,
        tipo: ticket.tipo,
        assignedToUserId: ticket.assignedToUserId,
        resolutionChannel: "status_change",
        consumedReservations: consumedCount,
      });
    } else {
      void trackServerUxEvent({
        eventName: "ticket_status_change",
        actor: { userId: actor.userId, role: actor.role },
        request,
        path: `/tickets/${ticket.id}`,
        props: {
          from: ticket.status,
          to: parsed.data.nextStatus,
          priority: ticket.priority,
        },
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
