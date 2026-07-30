import type { WidgetLayout } from "@/lib/dashboard/widget-layout";

export type WidgetDensity = "small" | "medium" | "large";

/** Deriva densidad visual del layout real (no del campo legado `size`). */
export function deriveWidgetDensity(layout: WidgetLayout): WidgetDensity {
  const areaScore = (layout.colSpan / 100) * (layout.minHeightPx / 400);
  if (layout.colSpan <= 30 || layout.minHeightPx <= 240) return "small";
  if (layout.colSpan >= 75 || layout.minHeightPx >= 420 || areaScore >= 1.1) return "large";
  return "medium";
}

/** Widgets muy estrechos o bajos: modo alta densidad (ejes compactos, sin tabla visible). */
export function isHighDensityLayout(layout: WidgetLayout): boolean {
  return layout.colSpan <= 26 || layout.minHeightPx <= 220;
}

/** ColSpan efectivo en viewports estrechos: apila widgets en móvil. */
export function getEffectiveColSpan(colSpan: number, isMobile: boolean): number {
  if (!isMobile) return colSpan;
  if (colSpan >= 50) return 100;
  if (colSpan >= 34) return 100;
  return Math.min(100, Math.max(colSpan, 50));
}

export function isCompactWidgetHeader(layout: WidgetLayout): boolean {
  return layout.colSpan <= 38 || layout.minHeightPx < 340;
}
