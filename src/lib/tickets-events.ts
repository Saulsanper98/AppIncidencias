/**
 * Helpers para publicar eventos SSE de tickets de forma consistente desde
 * los distintos route handlers (`/api/tickets/...`). Centraliza el shape del
 * payload y el nombre del evento para que el cliente pueda confiar en él.
 *
 * El cliente se suscribe vía `useSseEvent("ticket_*", listener)` y refresca
 * la vista correspondiente.
 */

import { sseBus, type SseEventName } from "@/lib/sse-bus";

export type TicketEventPayload = {
  id: string;
  busId: string;
  status: string;
  priority: string;
  title: string;
  assignedToUserId?: string | null;
  /** Nombre humano del actor que disparó el cambio (para mostrar en toast). */
  by?: string;
  /** Para `ticket_status_changed`: estado previo (útil en la UI). */
  previousStatus?: string;
  /** Para `ticket_assigned`: nombre humano del nuevo asignado. */
  assignedToUserName?: string | null;
};

export function publishTicketEvent(
  type: Extract<
    SseEventName,
    | "ticket_created"
    | "ticket_updated"
    | "ticket_status_changed"
    | "ticket_assigned"
    | "ticket_commented"
    | "ticket_deleted"
  >,
  payload: TicketEventPayload,
): void {
  try {
    sseBus.publish(type, payload);
  } catch (error) {
    // Un fallo del bus jamás debe romper la operación de negocio.
    console.warn("[tickets-events] no se pudo publicar", type, error);
  }
}
