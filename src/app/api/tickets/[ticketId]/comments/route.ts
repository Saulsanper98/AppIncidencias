import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { renderTicketEmail, sendUserEmail } from "@/lib/email-notifications";
import { prisma } from "@/lib/prisma";
import { canAddTicketComment } from "@/lib/rbac";
import { publishTicketEvent } from "@/lib/tickets-events";

const commentSchema = z.object({
  body: z.string().trim().min(1).max(8000),
});

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }
    if (!canAddTicketComment(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para añadir notas" }, { status: 403 });
    }

    const { ticketId } = await context.params;
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, busId: true, status: true, priority: true, title: true, assignedToUserId: true },
    });
    if (!ticket) {
      return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
    }

    const payload = await request.json();
    const parsed = commentSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Comentario invalido" }, { status: 400 });
    }

    const created = await prisma.ticketComment.create({
      data: {
        ticketId: ticket.id,
        author: actor.displayName,
        body: parsed.data.body,
      },
    });

    await writeAuditEvent({
      userId: actor.userId,
      ticketId: ticket.id,
      action: "ticket.comment_added",
      detail: `Nota por ${actor.displayName} (${parsed.data.body.slice(0, 120)}${parsed.data.body.length > 120 ? "…" : ""})`,
    });

    publishTicketEvent("ticket_commented", {
      id: ticket.id,
      busId: ticket.busId,
      status: ticket.status,
      priority: ticket.priority,
      title: ticket.title,
      assignedToUserId: ticket.assignedToUserId,
      by: actor.displayName,
    });

    // Si el ticket tiene asignado y NO es el propio comentador, le mandamos
    // un aviso por email para que sepa que hay una nota nueva.
    if (
      ticket.assignedToUserId &&
      ticket.assignedToUserId !== actor.userId
    ) {
      const previewBody = parsed.data.body.length > 240
        ? `${parsed.data.body.slice(0, 240).trim()}…`
        : parsed.data.body;
      const { subject, html } = renderTicketEmail({
        headline: "Nuevo comentario en un ticket asignado a ti",
        body: `${actor.displayName} ha añadido una nota:<br/><br/><em>${previewBody.replace(/[<>]/g, "")}</em>`,
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        busId: ticket.busId,
        status: ticket.status,
        priority: ticket.priority,
        actor: actor.displayName,
      });
      void sendUserEmail({
        userIds: [ticket.assignedToUserId],
        subject,
        html,
        dedupeKey: `comment:${ticket.id}:${created.id}`,
      });
    }

    return NextResponse.json({
      ok: true,
      comment: {
        id: created.id,
        author: created.author,
        body: created.body,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating ticket comment:", error);
    return NextResponse.json({ message: "No se pudo guardar la nota" }, { status: 500 });
  }
}
