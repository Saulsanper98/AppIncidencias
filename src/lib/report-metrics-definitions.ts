/**
 * Definiciones canónicas de KPIs del reporte operativo (/reportes).
 * Compartidas entre API y UI para que el usuario sepa qué mide cada cifra.
 */
export const REPORT_METRIC_DEFINITIONS = {
  created:
    "Tickets cuyo alta quedó registrada en el periodo (campo createdAt). Incluye borradores, express y cierres directos.",
  resolved:
    "Acciones de cierre en el periodo (TicketStatusChange → resuelto). Si un ticket se cierra dos veces, cuenta dos.",
  uniqueTicketsResolved:
    "Tickets distintos que tuvieron al menos un cierre en el periodo (sin contar reaperturas duplicadas).",
  slaCompliance:
    "Porcentaje de cierres del periodo resueltos antes o en la fecha límite SLA del ticket.",
  mttr:
    "Tiempo medio desde la creación del ticket hasta cada acción de cierre en el periodo.",
  topTechnicians:
    "Cierres del técnico en el periodo (TicketStatusChange + tickets históricos sin historial, atribuidos al asignado). No es el total de tickets asignados en la bandeja.",
  topBuses:
    "Buses con más tickets creados en el periodo (no confundir con resoluciones).",
  topConductors:
    "Conductores con más tickets de origen «conductor» en el periodo (requiere origen del fallo y conductor informado).",
  seriesResolved:
    "Curva diaria de acciones de cierre (TicketStatusChange), alineada con el total «Tickets resueltos».",
  legacyUpdatedAt:
    "Método antiguo: tickets en estado resuelto cuyo updatedAt cae en el periodo. Puede inflarse por ediciones posteriores.",
} as const;

export type ReportDataQuality = {
  resolutionEvents: number;
  uniqueTicketsResolved: number;
  technicianAttributed: number;
  legacyUpdatedAtCount: number;
  gapLegacyVsEvents: number;
  ticketsWithoutHistory: number;
};
