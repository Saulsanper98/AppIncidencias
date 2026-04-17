export type MetricFormat = "number" | "compact" | "percent" | "integer";

export function formatMetric(value: number | string, format: MetricFormat, digits = 1) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  if (format === "integer") return String(Math.round(numeric));
  if (format === "percent") return `${numeric.toFixed(0)}%`;
  if (format === "compact") {
    return new Intl.NumberFormat("es-ES", {
      notation: "compact",
      maximumFractionDigits: digits,
    }).format(numeric);
  }

  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: digits,
  }).format(numeric);
}

export const CHART_THEME = {
  grid: {
    stroke: "rgba(148,163,184,0.08)",
    dash: "3 3",
  },
  axisTick: {
    fill: "var(--color-text-3)",
    fontSize: 11,
  },
  axisTickSmall: {
    fill: "var(--color-text-3)",
    fontSize: 10,
  },
  tooltip: {
    contentStyle: {
      background: "var(--color-surface-3)",
      border: "1px solid var(--color-border)",
      borderRadius: "8px",
      fontSize: "12px",
    },
    labelStyle: { color: "var(--color-text-1)" },
  },
} as const;
