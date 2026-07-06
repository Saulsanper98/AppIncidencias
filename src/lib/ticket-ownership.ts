/** Campos mínimos para decidir si un ticket pertenece al actor. */
export type TicketOwnershipFields = {
  assignedToUserId?: string | null;
  createdByUserId?: string | null;
};

/** Ticket asignado al usuario o creado por él. */
export function isTicketOwnedByActor(
  ticket: TicketOwnershipFields,
  actorUserId: string | null | undefined,
): boolean {
  if (!actorUserId) return false;
  return ticket.assignedToUserId === actorUserId || ticket.createdByUserId === actorUserId;
}
