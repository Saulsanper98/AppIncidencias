"use client";

import { MiniSparkline } from "@/components/charts/sparkline";
import { CHART_THEME, formatMetric, type MetricFormat } from "@/lib/dashboard/chart-theme";
import { colorWithAlpha, getCategoryColor } from "@/lib/dashboard/chart-palette";
import { getDataSourceLabel as getRegistryLabel } from "@/lib/dashboard/data-sources";
import { formatPeriodDeltaLabel } from "@/lib/dashboard/period-delta";
import { getEntryLabel, isTicketDistributionSource } from "@/lib/dashboard/widget-data-helpers";

import type { ReactElement } from "react";

import type { DataEntry, ExecutiveTooltipPayloadItem, TreemapContentProps } from "./types";

export function getDataSourceMicrocopy(dataSource: string, totalPoints: number) {
  if (dataSource === "sla_compliance") return "Resueltos en plazo vs fuera de plazo por día.";
  if (dataSource === "tickets_trend") return "Entradas y cierres diarios en el periodo.";
  if (dataSource === "backlog_by_status") return "Snapshot del backlog activo.";
  if (dataSource === "tickets_by_priority") return "Snapshot: criticidad de tickets en el conjunto actual.";
  if (dataSource === "tickets_by_operator") return "Snapshot: tickets agrupados por operadora.";
  if (dataSource === "tickets_by_status") return "Snapshot: tickets agrupados por estado.";
  if (dataSource === "manual") return "Origen manual para analisis puntual.";
  if (dataSource === "operation_links") return "Accesos al contenido habitual del panel.";
  if (dataSource.startsWith("embed_")) return "Vista embebida de la aplicación.";
  return `${totalPoints} puntos en visualizacion`;
}

/** Pie/Sankey/Funnel suelen dejar `label` vacío; el nombre útil va en `payload[0].name` o en el objeto anidado. */
export function resolveTooltipContext(
  label: string | number | undefined,
  payload: ReadonlyArray<ExecutiveTooltipPayloadItem> | undefined,
  sourceData: DataEntry[],
  dataSource: string,
): { title: string; rowIndex: number } {
  const p0 = payload?.[0] as ExecutiveTooltipPayloadItem & {
    payload?: DataEntry & { source?: { name?: string }; target?: { name?: string } };
  };

  let title = label != null && String(label).trim() !== "" ? String(label) : "";
  let rowIndex = title ? sourceData.findIndex((item) => getEntryLabel(item) === title) : -1;

  if (!title && p0?.name != null && String(p0.name).trim() !== "") {
    title = String(p0.name);
    rowIndex = sourceData.findIndex((item) => getEntryLabel(item) === title);
  }

  const nested = p0?.payload;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const tp = nested as { source?: { name?: string }; target?: { name?: string } };
    if (tp?.target?.name) {
      const targetName = String(tp.target.name);
      const sourceName = tp.source?.name ? String(tp.source.name) : "";
      title =
        sourceName && sourceName !== targetName ? `${sourceName} → ${targetName}` : targetName || title;
      rowIndex = sourceData.findIndex((item) => getEntryLabel(item) === targetName);
    } else {
      const fromRow = getEntryLabel(nested as DataEntry);
      if (fromRow) {
        if (!title) title = fromRow;
        rowIndex = sourceData.findIndex((item) => getEntryLabel(item) === fromRow);
      }
    }
  }

  if (rowIndex < 0 && p0) {
    const rawVal = p0.value;
    const v = typeof rawVal === "number" ? rawVal : Number(rawVal ?? NaN);
    if (Number.isFinite(v)) {
      const idx = sourceData.findIndex((row) => {
        const rv =
          dataSource === "sla_compliance"
            ? Number((row as { cumplido?: number | string }).cumplido ?? 0)
            : typeof row.value === "number"
              ? row.value
              : Number(row.value ?? NaN);
        return rv === v;
      });
      if (idx >= 0) {
        rowIndex = idx;
        if (!title) title = getEntryLabel(sourceData[idx]!);
      }
    }
  }

  if (!title) title = getRegistryLabel(dataSource);
  return { title, rowIndex };
}

export function getCardInsightLine(
  dataSource: string,
  sourceData: DataEntry[],
  numericValues: number[],
  metricFormat: MetricFormat,
  periodComparison?: {
    days: number;
    currentCreated: number;
    previousCreated: number;
    currentResolved: number;
    previousResolved: number;
  } | null,
): string | null {
  if (numericValues.length === 0) return null;
  const labels = sourceData.map((e) => getEntryLabel(e));

  const periodHint =
    periodComparison && (dataSource === "tickets_trend" || dataSource === "tickets_by_status" || dataSource === "tickets_by_hour")
      ? (() => {
          const created = formatPeriodDeltaLabel(
            periodComparison.currentCreated,
            periodComparison.previousCreated,
            `creados vs ${periodComparison.days}d ant.`,
          );
          const resolved = formatPeriodDeltaLabel(
            periodComparison.currentResolved,
            periodComparison.previousResolved,
            `resueltos vs ${periodComparison.days}d ant.`,
          );
          if (created && resolved) return `${created} · ${resolved}`;
          return created ?? resolved;
        })()
      : null;

  if (dataSource === "sla_compliance" && numericValues.length >= 2) {
    const first = numericValues[0] ?? 0;
    const last = numericValues[numericValues.length - 1] ?? 0;
    const rel = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : last - first;
    if (Math.abs(last - first) < 1e-6) return "SLA estable en el periodo: sin variacion dia a dia.";
    return `SLA: ultimo dia ${last >= first ? "mejor" : "peor"} que el inicio (${rel >= 0 ? "+" : ""}${rel.toFixed(0)}% vs primer dia).`;
  }
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const span = max - min;
  const flat = span < 1e-9 * Math.max(1, Math.abs(max));

  let base: string | null = null;
  if (isTicketDistributionSource(dataSource)) {
    if (flat) {
      base = "Recuentos muy similares entre categorias; pasa el cursor para ver cada valor.";
    } else {
      const maxIdx = numericValues.indexOf(max);
      const minIdx = numericValues.indexOf(min);
      const hi = labels[maxIdx] ?? "—";
      const lo = labels[minIdx] ?? "—";
      base = `Distribucion: mayor en «${hi}» (${formatMetric(max, metricFormat)}), menor en «${lo}» (${formatMetric(min, metricFormat)}).`;
    }
  } else if (flat) {
    base = "Serie homogenea: revisa MA en tooltip cuando haya mas contraste.";
  } else {
    const maxIdx = numericValues.indexOf(max);
    const minIdx = numericValues.indexOf(min);
    const hi = labels[maxIdx] ?? "—";
    const lo = labels[minIdx] ?? "—";
    base = `Operacion: pico en «${hi}» (${formatMetric(max, metricFormat)}), minimo «${lo}» (${formatMetric(min, metricFormat)}).`;
  }

  if (base && periodHint) return `${base} ${periodHint}`;
  return base ?? periodHint;
}

export function buildChartA11ySummary(params: {
  title: string;
  dataSourceLabel: string;
  dataSourceMicrocopy: string;
  sourceData: DataEntry[];
  numericValues: number[];
  metricFormat: MetricFormat;
  cardInsightLine: string | null;
}): string {
  const parts = [params.title, params.dataSourceLabel, params.dataSourceMicrocopy];
  if (params.cardInsightLine) parts.push(params.cardInsightLine);

  if (params.numericValues.length === 0) {
    parts.push("Sin datos para mostrar");
    return parts.join(". ");
  }

  const ranked = params.numericValues
    .map((value, index) => ({
      value,
      label: getEntryLabel(params.sourceData[index] ?? {}) || `Item ${index + 1}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const highlights = ranked
    .map((item) => `${item.label}: ${formatMetric(item.value, params.metricFormat)}`)
    .join("; ");

  parts.push(`${params.numericValues.length} puntos. Destacados: ${highlights}`);
  return parts.join(". ");
}

export function getSmartCategoryColor(label: string, palette: string[]) {
  return getCategoryColor(label, palette);
}

export function getTickByWidgetSize(size: string) {
  if (size === "small") return CHART_THEME.axisTickSmall;
  return CHART_THEME.axisTick;
}

/** Media móvil de los puntos anteriores al índice (ventana máx. 5, mín. 1 punto previo). */
export function getTrailingMovingAverageBefore(values: readonly number[], index: number): number | null {
  if (index < 1 || values.length === 0) return null;
  const win = Math.min(5, index);
  const start = index - win;
  let sum = 0;
  for (let i = start; i < index; i += 1) sum += values[i] ?? 0;
  const avg = sum / win;
  return Number.isFinite(avg) ? avg : null;
}

export { MiniSparkline };

export const OPERATION_QUICK_LINKS = [
  // /bandeja desde junio 2026 (la bandeja se promovio a entrada propia
  // del sidebar; /tickets queda para gestion y mantenimiento).
  { href: "/bandeja", label: "Bandeja de tickets", hint: "Listado de tickets activos" },
  { href: "/tickets", label: "Nuevo ticket", hint: "Alta de incidencias y preventivo" },
  { href: "/dashboard", label: "Panel operativo", hint: "KPIs e incidencias activas" },
  { href: "/mapa", label: "Mapa de incidencias", hint: "Vista geográfica" },
  { href: "/preventivo", label: "Preventivo", hint: "Buses anómalos y tareas" },
] as const;

export function getChartEntryAnimationClass(chartType: string, size: string, presentationMode = false) {
  const isSmall = size === "small";
  const isLarge = size === "large";

  if (presentationMode) {
    if (chartType === "pie" || chartType === "radialbar" || chartType === "rose") return "scale-[0.96]";
    if (chartType === "scatter" || chartType === "bubble") return "translate-x-[8px]";
    if (chartType === "funnel" || chartType === "sankey" || chartType === "treemap") return "opacity-0 scale-[0.98]";
    if (chartType === "radar") return "scale-[0.98]";
    if (chartType === "kpi") return "translate-y-[8px]";
    return "translate-y-[10px]";
  }
  if (chartType === "pie" || chartType === "radialbar" || chartType === "rose") {
    if (isLarge) return "scale-[0.992]";
    if (isSmall) return "scale-[0.982]";
    return "scale-[0.985]";
  }
  if (chartType === "funnel" || chartType === "sankey" || chartType === "treemap") {
    if (isLarge) return "opacity-[0.88] scale-[0.992]";
    if (isSmall) return "opacity-[0.78] scale-[0.985]";
    return "opacity-[0.82] scale-[0.988]";
  }
  if (chartType === "radar") {
    if (isLarge) return "scale-[0.992]";
    if (isSmall) return "scale-[0.984]";
    return "scale-[0.988]";
  }
  if (chartType === "kpi") {
    if (isLarge) return "translate-y-[4px]";
    if (isSmall) return "translate-y-[6px]";
    return "translate-y-[5px]";
  }
  if (chartType === "line" || chartType === "area" || chartType === "stacked_area") {
    if (isLarge) return "translate-y-[2px]";
    if (isSmall) return "translate-y-[5px]";
    return "translate-y-[4px]";
  }
  if (chartType === "scatter" || chartType === "bubble") {
    if (isLarge) return "translate-x-[2px]";
    if (isSmall) return "translate-x-[5px]";
    return "translate-x-[4px]";
  }
  if (isLarge) return "translate-y-[1px]";
  if (isSmall) return "translate-y-[3px]";
  return "translate-y-[2px]";
}

export function getPresentationStaggerDelayMs(index: number): number {
  return Math.min(index * 70, 560);
}

export function getTransitionByWidgetSize(size: string, presentationMode = false) {
  if (presentationMode) {
    return {
      durationMs: 520,
      className: "duration-500 ease-out",
      transitionOpacityClass: "opacity-0",
    };
  }
  if (size === "small") {
    return {
      durationMs: 140,
      className: "duration-150 ease-out",
      transitionOpacityClass: "opacity-70",
    };
  }
  if (size === "large") {
    return {
      durationMs: 240,
      className: "duration-300 ease-in-out",
      transitionOpacityClass: "opacity-[0.82]",
    };
  }
  return {
    durationMs: 180,
    className: "duration-200 ease-in-out",
    transitionOpacityClass: "opacity-70",
  };
}

export function createTreemapCellRenderer(accentColor: string, values: number[] = []) {
  const maxVal = values.length > 0 ? Math.max(...values, 1) : 1;
  return function renderTreemapCell(props: TreemapContentProps): ReactElement {
    const { x = 0, y = 0, width = 0, height = 0, name, value, fill, index = 0 } = props;
    if (width <= 0 || height <= 0) return <g />;
    const numVal = typeof value === "number" ? value : Number(value ?? 0);
    const intensity = 0.45 + (numVal / maxVal) * 0.55;
    const showLabel = width > 48 && height > 22;
    const cellFill = fill ?? accentColor;
    return (
      <g>
        <rect
          x={x + 1}
          y={y + 1}
          width={Math.max(0, width - 2)}
          height={Math.max(0, height - 2)}
          fill={cellFill}
          fillOpacity={intensity}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={1}
          rx={7}
          ry={7}
          className="dashboard-treemap-cell"
          style={{ pointerEvents: "all" }}
        />
        {showLabel ? (
          <>
            <text x={x + 8} y={y + 16} fill="var(--color-text-1)" fontSize={10} fontWeight={700}>
              {String(name ?? "").slice(0, 14)}
            </text>
            {height > 36 ? (
              <text x={x + 8} y={y + 30} fill="var(--color-text-3)" fontSize={9} fontWeight={600}>
                {numVal}
              </text>
            ) : null}
          </>
        ) : null}
      </g>
    );
  };
}
