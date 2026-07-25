import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/auth-context";
import { publishTicketEvent } from "@/lib/tickets-events";

type DeleteTicketOpts = {
  ticketId: string;
  actorUserId: string;
  actorDisplayName: string;
  reason: string;
  /** Texto extra para auditoría (p. ej. aprobación de solicitud). */
  auditPrefix?: string;
};

/** Borra un ticket y deja constancia en auditoría antes del cascade. */
export async function deleteTicketWithAudit({
  ticketId,
  actorUserId,
  actorDisplayName,
  reason,
  auditPrefix,
}: DeleteTicketOpts): Promise<{ deletedId: string; busId: string }> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { bus: { select: { id: true } } },
  });
  if (!ticket) {
    throw new Error("TICKET_NOT_FOUND");
  }

  const shortId = ticket.id.slice(-8).toUpperCase();
  const prefix = auditPrefix?.trim() ? `${auditPrefix.trim()} ` : "";
  await writeAuditEvent({
    userId: actorUserId,
    action: "ticket.deleted",
    detail: `${prefix}Eliminó ticket ${shortId} (bus ${ticket.busId}, "${ticket.title}", estado ${ticket.status}). Motivo: ${reason}`,
  });

  await prisma.ticket.delete({ where: { id: ticketId } });

  publishTicketEvent("ticket_deleted", {
    id: ticket.id,
    busId: ticket.busId,
    status: ticket.status,
    priority: ticket.priority,
    title: ticket.title,
    assignedToUserId: ticket.assignedToUserId,
    by: actorDisplayName,
  });

  return { deletedId: ticketId, busId: ticket.busId };
}
