import type { TicketStatus } from "@/lib/domain";
import type { ServerUxActor } from "@/lib/ux-server";
import { trackServerUxEvent } from "@/lib/ux-server";

/** Canal por el que se registró la resolución (telemetría estructurada). */
export type TicketResolutionChannel =
  | "status_change"
  | "create_closed"
  | "express"
  | "draft_promote";

export type TrackTicketResolvedInput = {
  actor: ServerUxActor;
  request?: Request | null;
  ticketId: string;
  busId?: string | null;
  fromStatus: TicketStatus | null;
  createdAt: Date;
  resolvedAt?: Date;
  slaDeadline: Date;
  priority: string;
  tipo?: string | null;
  assignedToUserId?: string | null;
  resolutionChannel: TicketResolutionChannel;
  consumedReservations?: number;
};

/**
 * Emite `ticket_resolved` en `UxEvent` con props estructuradas y uniformes
 * en todos los flujos de cierre (cambio de estado, alta cerrada, express,
 * borrador promovido).
 */
export function trackTicketResolvedTelemetry(input: TrackTicketResolvedInput): void {
  const resolvedAt = input.resolvedAt ?? new Date();
  const mttrMs = Math.max(0, resolvedAt.getTime() - input.createdAt.getTime());
  const slaMet = resolvedAt.getTime() <= input.slaDeadline.getTime();

  void trackServerUxEvent({
    eventName: "ticket_resolved",
    actor: input.actor,
    request: input.request,
    path: `/tickets/${input.ticketId}`,
    durationMs: mttrMs,
    props: {
      ticket_id: input.ticketId,
      bus_id: input.busId ?? null,
      from_status: input.fromStatus,
      to_status: "resuelto",
      resolution_channel: input.resolutionChannel,
      priority: input.priority,
      tipo: input.tipo ?? null,
      sla_met: slaMet,
      assigned: !!input.assignedToUserId,
      consumed_reservations: input.consumedReservations ?? 0,
    },
  });
}
