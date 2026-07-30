export type TickerItemTone = "critical" | "warning" | "info";

export type TickerItemKind =
  | "desvio_summary"
  | "desvio_pendiente"
  | "ticket_critical"
  | "sla_summary"
  | "today_summary"
  | "poller_error";

export type TickerItem = {
  id: string;
  kind: TickerItemKind;
  tone: TickerItemTone;
  /** Texto corto para la franja (sin HTML). */
  label: string;
  /** Texto completo para tooltip / panel móvil. */
  title?: string;
  href?: string;
};

export type TickerSummaryPart = {
  id: string;
  label: string;
  href?: string;
};

export type TickerSnapshot = {
  items: TickerItem[];
  summaryParts: TickerSummaryPart[];
  /** Si hay señales urgentes (punto ámbar/rojo). */
  hasPulse: boolean;
  /** Intervalo sugerido de refresco en ms (fallback si no hay SSE). */
  refreshMs: number;
  /** Firma del contenido; cambia cuando hay novedad operativa relevante. */
  signature: string;
};
