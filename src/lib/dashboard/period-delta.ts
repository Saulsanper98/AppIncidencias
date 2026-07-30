/** Formatea variación porcentual vs periodo anterior (p. ej. «+12% vs ant.»). */
export function formatPeriodDeltaLabel(
  current: number | null | undefined,
  previous: number | null | undefined,
  suffix = "vs ant.",
): string | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return "Sin cambio";
    return `Nuevo ${suffix}`.trim();
  }
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return "Sin cambio";
  return `${pct > 0 ? "+" : ""}${pct}% ${suffix}`.trim();
}

export type PeriodDeltaTone = "success" | "warning" | "error" | "neutral";

/** Menos creados = mejor operativamente; más resueltos = mejor. */
export function periodDeltaTone(
  kind: "created" | "resolved",
  current: number,
  previous: number,
): PeriodDeltaTone {
  if (previous === 0 && current === 0) return "neutral";
  if (kind === "created") {
    if (current < previous) return "success";
    if (current > previous) return "warning";
    return "neutral";
  }
  if (current > previous) return "success";
  if (current < previous) return "warning";
  return "neutral";
}
