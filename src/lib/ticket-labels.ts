import type { TicketPriority, TicketStatus } from "@/lib/domain";

/** Etiquetas de estado mostradas en bandeja, detalle y exportaciones. */
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  borrador: "Pendiente de completar",
  abierto: "Abierto",
  en_proceso: "En Proceso",
  esperando_repuesto: "Esperando Repuesto",
  resuelto: "Resuelto",
};

/** Etiquetas de prioridad para exportaciones y badges. */
export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};
