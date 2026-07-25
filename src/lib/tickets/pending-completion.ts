import type { TicketStatus } from "@/lib/domain";

/** Ticket de apunte express u otro flujo mínimo pendiente de tipología/adjuntos. */
export function ticketNeedsCompletion(ticket: {
  status: TicketStatus;
  needsCompletion?: boolean | null;
}): boolean {
  return ticket.needsCompletion === true || ticket.status === "borrador";
}

/** Filtro Prisma para bandeja «Pend. completar». */
export function pendingCompletionWhere() {
  return { needsCompletion: true as const };
}
