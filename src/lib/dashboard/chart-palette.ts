const SECONDARY = ["#059669", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#DB2777", "#65A30D", "#EA580C"] as const;

/** Colores semánticos de series operativas (tickets, SLA). */
export const CHART_SERIES = {
  created: "#DC2626",
  resolved: "#059669",
  slaOk: "#059669",
  slaBreached: "#DC2626",
  accentFallback: "#2563EB",
} as const;

export function getTicketsTrendSeries() {
  return [
    { dataKey: "creados", name: "Creados", color: CHART_SERIES.created },
    { dataKey: "resueltos", name: "Resueltos", color: CHART_SERIES.resolved },
  ] as const;
}

export function getSlaComplianceSeries(accentColor: string, breachColor: string = CHART_SERIES.slaBreached) {
  return [
    { dataKey: "cumplido", name: "En plazo", color: accentColor || CHART_SERIES.slaOk },
    { dataKey: "incumplido", name: "Fuera de plazo", color: breachColor },
  ] as const;
}

export function buildChartPalette(accentColor: string): string[] {
  return [accentColor, ...SECONDARY];
}

export function hashLabel(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) hash = (hash << 5) - hash + label.charCodeAt(i);
  return Math.abs(hash);
}

export function getCategoryColor(label: string, palette: readonly string[]): string {
  if (!label) return palette[0] ?? "#2563EB";
  const key = label.trim().toLowerCase();
  const semantic: Record<string, string> = {
    abierto: "#22C55E",
    "en proceso": "#38BDF8",
    "en_proceso": "#38BDF8",
    "esperando repuesto": "#A855F7",
    "esperando_repuesto": "#A855F7",
    resuelto: "#F43F5E",
    alta: "#EF4444",
    media: "#F59E0B",
    baja: "#64748B",
  };
  if (semantic[key]) return semantic[key];
  return palette[hashLabel(label) % palette.length] ?? palette[0] ?? "#2563EB";
}

/** Series ordinales densas (p. ej. 24 horas): un color + sin leyenda categórica. */
export function isDenseOrdinalSeries(dataSource: string): boolean {
  return dataSource === "tickets_by_hour";
}

export function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getPieRadii(chartHeight: number, variant: "donut" | "rose" = "donut", highDensity = false) {
  const densityScale = highDensity ? 0.82 : 1;
  const scale = Math.min(1, Math.max(0.55, chartHeight / 280)) * densityScale;
  if (variant === "rose") {
    return {
      innerRadius: Math.round(22 * scale),
      outerRadius: Math.round(Math.min(92, chartHeight * 0.34)),
      cx: "50%",
      cy: "46%",
    };
  }
  return {
    innerRadius: Math.round(Math.min(58, chartHeight * 0.22)),
    outerRadius: Math.round(Math.min(96, chartHeight * 0.36)),
    cx: "50%",
    cy: "50%",
  };
}
