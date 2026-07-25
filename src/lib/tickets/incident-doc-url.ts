export function ticketIncidentDocUrl(ticketId: string): string {
  return `/api/tickets/${encodeURIComponent(ticketId)}/incident-doc`;
}
