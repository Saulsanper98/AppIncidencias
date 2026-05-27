"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ref } from "react";
import { Copy, Download, EyeOff, RotateCcw, Wand2, X } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Sankey,
  Treemap,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { DashboardPreventiveAgenda } from "@/components/dashboard-preventive-agenda";
import { InventoryCompactWidget } from "@/components/dashboard-embeds/inventory-compact-widget";
import { TicketsBandejaWidget } from "@/components/dashboard-embeds/tickets-bandeja-widget";
import { CHART_THEME, formatMetric, type MetricFormat } from "@/lib/dashboard/chart-theme";
import { cn } from "@/lib/utils";
import type { ChartType } from "@/lib/dashboard/chart-types";

type WidgetRendererProps = {
  widget: {
    id: string;
    title: string;
    chartType: ChartType;
    dataSource: string;
    size: string;
    config: string;
  };
  data: DashboardData;
  isEditing?: boolean;
  onRemove?: (id: string) => void;
  onRequestEdit?: () => void;
  onDuplicate?: (id: string) => void;
  onQuickToggleLegend?: (id: string) => void;
  onQuickCycleChartType?: (id: string) => void;
  onQuickResetVisual?: (id: string) => void;
  onQuickChangeSource?: (id: string, dataSource: string) => void;
  presentationMode?: boolean;
  animationDelayMs?: number;
  exportRootRef?: Ref<HTMLDivElement | null>;
  isKeyboardFocused?: boolean;
  onWidgetPaneMouseDown?: () => void;
  onExportWidget?: () => void;
  /** Altura efectiva (px) que ocupará el área de gráfico. Si no se pasa, cae a 220 px (legado). */
  chartHeight?: number;
};

type DashboardData = {
  tickets_by_status: { name: string; value: number }[];
  tickets_by_operator: { name: string; value: number }[];
  tickets_by_priority: { name: string; value: number }[];
  sla_compliance: { day: string; cumplido: number; incumplido: number }[];
};

type ManualConfig = {
  manualData?: { name: string; value: number }[];
  accentColor?: string;
  showLegend?: boolean;
  seriesLabels?: {
    serieA?: string;
    serieB?: string;
    serieC?: string;
  };
  lockSeriesLabels?: boolean;
  showGrid?: boolean;
  smoothLines?: boolean;
  metricFormat?: MetricFormat;
};

type DataEntry = Record<string, string | number>;
type LegendEntry = { value?: string | number; color?: string };
type ExecutiveTooltipPayloadItem = {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: string | number;
  /** Fila original (pie, bar…) o enlace Sankey con nodos `source` / `target`. */
  payload?: Record<string, unknown>;
};
type ExecutiveTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<ExecutiveTooltipPayloadItem>;
  label?: string | number;
};

function getEntryLabel(entry: DataEntry) {
  return String((entry as { day?: string; name?: string }).day ?? (entry as { name?: string }).name ?? "");
}

function buildMultiSeriesData(sourceData: DataEntry[], dataSource: string) {
  return sourceData.map((entry, index) => {
    const baseLabel = getEntryLabel(entry);
    const mainValue =
      typeof entry.value === "number"
        ? entry.value
        : Number(dataSource === "sla_compliance" ? (entry as { cumplido?: number | string }).cumplido ?? 0 : entry.value ?? 0);
    const secondaryValue =
      dataSource === "sla_compliance"
        ? Number((entry as { incumplido?: number | string }).incumplido ?? 0)
        : Math.max(1, Math.round(mainValue * (0.35 + (index % 3) * 0.15)));
    return {
      name: baseLabel,
      serieA: Math.max(0, mainValue),
      serieB: Math.max(0, secondaryValue),
      serieC: Math.max(0, Math.round((mainValue + secondaryValue) * 0.3)),
    };
  });
}

function buildNumericValues(sourceData: DataEntry[], dataSource: string) {
  return sourceData.map((entry) => {
    const raw = dataSource === "sla_compliance" ? (entry as { cumplido?: number | string }).cumplido ?? 0 : entry.value ?? 0;
    const value = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(value) ? value : 0;
  });
}

function renderLegendContent(payload: ReadonlyArray<LegendEntry>, isSmallWidget: boolean, paddingTop: string) {
  return (
    <div
      style={{
        display: isSmallWidget ? "grid" : "flex",
        gridTemplateColumns: isSmallWidget ? "repeat(2, minmax(0, 1fr))" : undefined,
        flexWrap: isSmallWidget ? undefined : "wrap",
        justifyContent: isSmallWidget ? undefined : "space-evenly",
        rowGap: isSmallWidget ? undefined : 4,
        columnGap: isSmallWidget ? undefined : 16,
        gap: isSmallWidget ? "4px 8px" : undefined,
        paddingTop,
        justifyItems: isSmallWidget ? "center" : "stretch",
      }}
    >
      {payload.map((item, index) => (
        <div
          key={`${String(item.value ?? "")}-${index}`}
          style={{
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            gap: 5,
            justifyContent: isSmallWidget ? "center" : "flex-start",
            width: isSmallWidget ? "fit-content" : "auto",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 2,
              backgroundColor: item.color ?? "var(--color-text-3)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              color: "var(--color-text-3)",
              fontSize: "10px",
              lineHeight: "10px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {String(item.value ?? "")}
          </span>
        </div>
      ))}
    </div>
  );
}

function getDataSourceLabel(dataSource: string) {
  if (dataSource === "tickets_by_status") return "Tickets por estado";
  if (dataSource === "tickets_by_operator") return "Tickets por operadora";
  if (dataSource === "tickets_by_priority") return "Tickets por prioridad";
  if (dataSource === "sla_compliance") return "Cumplimiento SLA (7 días)";
  if (dataSource === "manual") return "Datos manuales";
  if (dataSource === "operation_links") return "Enlaces de operación";
  if (dataSource === "embed_tickets") return "Bandeja de tickets (resumen)";
  if (dataSource === "embed_inventory") return "Inventario (resumen)";
  if (dataSource === "embed_map") return "Mapa embebido (descontinuado)";
  if (dataSource === "embed_preventive") return "Agenda preventiva (resumen)";
  return "Fuente personalizada";
}

function getDataSourceMicrocopy(dataSource: string, totalPoints: number) {
  if (dataSource === "sla_compliance") return "Comparando cumplimiento diario (7 dias).";
  if (dataSource === "tickets_by_priority") return "Snapshot: criticidad de tickets en el conjunto actual.";
  if (dataSource === "tickets_by_operator") return "Snapshot: tickets agrupados por operadora.";
  if (dataSource === "tickets_by_status") return "Snapshot: tickets agrupados por estado.";
  if (dataSource === "manual") return "Origen manual para analisis puntual.";
  if (dataSource === "operation_links") return "Accesos al contenido habitual del panel.";
  if (dataSource.startsWith("embed_")) return "Vista embebida de la aplicación.";
  return `${totalPoints} puntos en visualizacion`;
}

/** Fuentes categóricas (conteos por dimensión), sin serie temporal: no aplican mensajes de MA ni “serie homogénea” genéricos. */
function isTicketDistributionSource(dataSource: string) {
  return (
    dataSource === "tickets_by_status" ||
    dataSource === "tickets_by_operator" ||
    dataSource === "tickets_by_priority"
  );
}

/** Pie/Sankey/Funnel suelen dejar `label` vacío; el nombre útil va en `payload[0].name` o en el objeto anidado. */
function resolveTooltipContext(
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

  if (!title) title = getDataSourceLabel(dataSource);
  return { title, rowIndex };
}

function getCardInsightLine(
  dataSource: string,
  sourceData: DataEntry[],
  numericValues: number[],
  metricFormat: MetricFormat,
): string | null {
  if (numericValues.length === 0) return null;
  const labels = sourceData.map((e) => getEntryLabel(e));
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

  if (isTicketDistributionSource(dataSource)) {
    if (flat) {
      return "Recuentos muy similares entre categorias; pasa el cursor para ver cada valor.";
    }
    const maxIdx = numericValues.indexOf(max);
    const minIdx = numericValues.indexOf(min);
    const hi = labels[maxIdx] ?? "—";
    const lo = labels[minIdx] ?? "—";
    return `Distribucion: mayor en «${hi}» (${formatMetric(max, metricFormat)}), menor en «${lo}» (${formatMetric(min, metricFormat)}).`;
  }

  if (flat) return "Serie homogenea: revisa MA en tooltip cuando haya mas contraste.";
  const maxIdx = numericValues.indexOf(max);
  const minIdx = numericValues.indexOf(min);
  const hi = labels[maxIdx] ?? "—";
  const lo = labels[minIdx] ?? "—";
  return `Operacion: pico en «${hi}» (${formatMetric(max, metricFormat)}), minimo «${lo}» (${formatMetric(min, metricFormat)}).`;
}

function hashLabel(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) hash = (hash << 5) - hash + label.charCodeAt(i);
  return Math.abs(hash);
}

function getSmartCategoryColor(label: string, palette: string[]) {
  if (!label) return palette[0];
  return palette[hashLabel(label) % palette.length];
}

function getTickByWidgetSize(size: string) {
  if (size === "small") return CHART_THEME.axisTickSmall;
  return CHART_THEME.axisTick;
}

/** Media móvil de los puntos anteriores al índice (ventana máx. 5, mín. 1 punto previo). */
function getTrailingMovingAverageBefore(values: readonly number[], index: number): number | null {
  if (index < 1 || values.length === 0) return null;
  const win = Math.min(5, index);
  const start = index - win;
  let sum = 0;
  for (let i = start; i < index; i += 1) sum += values[i] ?? 0;
  const avg = sum / win;
  return Number.isFinite(avg) ? avg : null;
}

const SPARKLINE_W = 112;
const SPARKLINE_H = 28;
const SPARK_PAD = 4;

function MiniSparkline({
  values,
  highlightIndex,
  accentColor,
}: {
  values: readonly number[];
  highlightIndex: number;
  accentColor: string;
}) {
  if (values.length < 2) return null;
  const w = SPARKLINE_W;
  const h = SPARKLINE_H;
  const pad = SPARK_PAD;
  const innerW = w - 2 * pad;
  const innerH = h - 2 * pad;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);
  const hi = Math.max(0, Math.min(highlightIndex, values.length - 1));
  const coords = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * innerW;
    const y = pad + innerH - ((v - min) / span) * innerH;
    return { x, y };
  });
  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join("");
  const { x: hx, y: hy } = coords[hi] ?? coords[0]!;
  return (
    <svg width={w} height={h} className="mt-1.5 overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke="rgba(148,163,184,0.42)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={hx} cy={hy} r={3.5} fill={accentColor} stroke="var(--color-surface)" strokeWidth={1.5} />
    </svg>
  );
}

const QUICK_DATA_SOURCES = [
  { id: "tickets_by_status", label: "Estado" },
  { id: "tickets_by_operator", label: "Operadora" },
  { id: "tickets_by_priority", label: "Prioridad" },
  { id: "sla_compliance", label: "SLA" },
  { id: "manual", label: "Manual" },
  { id: "operation_links", label: "Enlaces" },
] as const;

const OPERATION_QUICK_LINKS = [
  { href: "/tickets", label: "Bandeja de tickets", hint: "Listado y alta de tickets" },
  { href: "/dashboard", label: "Panel operativo", hint: "KPIs e incidencias activas" },
  { href: "/mapa", label: "Mapa de incidencias", hint: "Vista geográfica" },
  { href: "/inventory", label: "Inventario", hint: "Repuestos y almacenes" },
] as const;

function getEmptyStateBySource(dataSource: string) {
  if (dataSource === "tickets_by_status") {
    return {
      title: "Aun no hay tickets por estado para mostrar.",
      action: "Revisa si hay tickets creados o amplía el rango temporal del dashboard.",
    };
  }
  if (dataSource === "tickets_by_operator") {
    return {
      title: "No hay datos por operadora en este momento.",
      action: "Valida la asignación de operadora en los tickets y vuelve a cargar.",
    };
  }
  if (dataSource === "tickets_by_priority") {
    return {
      title: "No hay prioridades registradas en el periodo actual.",
      action: "Comprueba que los tickets tienen prioridad calculada (impacto).",
    };
  }
  if (dataSource === "sla_compliance") {
    return {
      title: "Todavía no hay datos de cumplimiento SLA.",
      action: "Genera más actividad o cambia de fuente para ver métricas inmediatas.",
    };
  }
  if (dataSource === "manual") {
    return {
      title: "No hay datos manuales configurados.",
      action: "Añade un JSON válido en la configuración del widget para visualizarlo.",
    };
  }
  return {
    title: "Sin datos para la fuente seleccionada.",
    action: "Cambia la fuente o ajusta la configuración del widget.",
  };
}

function getChartEntryAnimationClass(chartType: string, size: string) {
  const isSmall = size === "small";
  const isLarge = size === "large";

  if (chartType === "pie" || chartType === "radialbar" || chartType === "rose") {
    if (isLarge) return "scale-[0.992]";
    if (isSmall) return "scale-[0.982]";
    return "scale-[0.985]";
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

function getTransitionByWidgetSize(size: string) {
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

export function WidgetRenderer({
  widget,
  data,
  isEditing,
  onRemove,
  onRequestEdit,
  onDuplicate,
  onQuickToggleLegend,
  onQuickCycleChartType,
  onQuickResetVisual,
  onQuickChangeSource,
  presentationMode = false,
  animationDelayMs = 0,
  exportRootRef,
  isKeyboardFocused = false,
  onWidgetPaneMouseDown,
  onExportWidget,
  chartHeight,
}: WidgetRendererProps) {
  // Altura final para cada ResponsiveContainer de Recharts. Si no se pasa nada
  // desde el padre (modo embed/legacy) cae al valor histórico de 220 px.
  const responsiveChartHeight = Math.max(20, Math.round(chartHeight ?? 220));
  const parsedConfig = useMemo<ManualConfig>(() => {
    try {
      return JSON.parse(widget.config ?? "{}") as ManualConfig;
    } catch {
      return {};
    }
  }, [widget.config]);

  const accentColor = parsedConfig.accentColor ?? "#2563EB";
  const showLegend = parsedConfig.showLegend ?? true;
  const showGrid = parsedConfig.showGrid ?? true;
  const smoothLines = parsedConfig.smoothLines ?? true;
  const metricFormat = parsedConfig.metricFormat ?? "number";
  const stackedLabels = {
    serieA: parsedConfig.seriesLabels?.serieA?.trim() || "Principal",
    serieB: parsedConfig.seriesLabels?.serieB?.trim() || "Secundaria",
    serieC: parsedConfig.seriesLabels?.serieC?.trim() || "Auxiliar",
  };

  const sourceData: DataEntry[] = useMemo(
    () =>
      widget.dataSource === "manual"
        ? (parsedConfig.manualData ?? [])
        : (data[widget.dataSource as keyof DashboardData] ?? []),
    [widget.dataSource, parsedConfig.manualData, data],
  );

  const palette = useMemo(
    () => [accentColor, "#059669", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#DB2777", "#65A30D"],
    [accentColor],
  );

  const entryColors = useMemo(
    () => sourceData.map((entry, index) => getSmartCategoryColor(getEntryLabel(entry) || String(index), palette)),
    [sourceData, palette],
  );

  const legendPayload = useMemo(
    () =>
      showLegend
        ? sourceData.map((entry, index) => ({
            value: getEntryLabel(entry),
            id: index,
            type: "square",
            color: entryColors[index],
          }))
        : undefined,
    [showLegend, sourceData, entryColors],
  );
  const stackedSeriesLegendPayload = useMemo(
    () =>
      showLegend
        ? [
            { value: stackedLabels.serieA, id: "serieA", type: "square", color: palette[0] },
            { value: stackedLabels.serieB, id: "serieB", type: "square", color: palette[1] },
            { value: stackedLabels.serieC, id: "serieC", type: "square", color: palette[2] },
          ]
        : undefined,
    [showLegend, palette, stackedLabels.serieA, stackedLabels.serieB, stackedLabels.serieC],
  );
  const isSmallWidget = widget.size === "small";
  const isDonut = widget.chartType === "pie";
  const cardPaddingClass =
    widget.size === "small" ? "p-4" : widget.size === "large" ? (presentationMode ? "p-7" : "p-6") : "p-5";
  const dataSourceLabel = getDataSourceLabel(widget.dataSource);
  const dataSourceMicrocopy = getDataSourceMicrocopy(widget.dataSource, sourceData.length);
  const emptyState = getEmptyStateBySource(widget.dataSource);
  const transitionBySize = getTransitionByWidgetSize(widget.size);
  const tickBySize = getTickByWidgetSize(widget.size);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const renderCompactLegend = (
    payload: ReadonlyArray<LegendEntry> | undefined,
    options?: { isDonut?: boolean; stacked?: boolean },
  ) => {
    if (!showLegend || !payload) return null;
    const height = isSmallWidget ? (options?.stacked ? 34 : 36) : options?.isDonut ? 30 : 22;
    const paddingTop = options?.isDonut && !isSmallWidget ? "10px" : "4px";
    return (
      <Legend
        {...({ payload } as Record<string, unknown>)}
        align="left"
        verticalAlign="bottom"
        height={height}
        wrapperStyle={{ left: 6, right: 6, width: "calc(100% - 12px)" }}
        content={(props: { payload?: ReadonlyArray<LegendEntry> }) =>
          renderLegendContent(props.payload ?? [], isSmallWidget, paddingTop)
        }
      />
    );
  };
  const compactLegend = renderCompactLegend(legendPayload, { isDonut });
  const compactStackedLegend = renderCompactLegend(stackedSeriesLegendPayload, { stacked: true });

  type ColoredDotProps = { cx?: number; cy?: number; index?: number };
  const renderColoredDot = (props: ColoredDotProps) => {
    const { cx, cy, index } = props ?? {};
    if (cx == null || cy == null) return null;
    const color = entryColors[(index ?? 0) % entryColors.length];
    return <circle cx={cx} cy={cy} r={3} fill={color} stroke={color} strokeWidth={1} />;
  };

  const formatTick = (value: number | string) => formatMetric(value, metricFormat);

  const multiSeriesData = useMemo(() => buildMultiSeriesData(sourceData, widget.dataSource), [sourceData, widget.dataSource]);

  const numericValues = useMemo(() => buildNumericValues(sourceData, widget.dataSource), [sourceData, widget.dataSource]);

  const sourceDataWithMaRef = useMemo(
    () =>
      sourceData.map((entry, i) => ({
        ...entry,
        maRef: getTrailingMovingAverageBefore(numericValues, i),
      })),
    [sourceData, numericValues],
  );

  const multiSeriesDataWithMaRef = useMemo(() => {
    const serieAValues = multiSeriesData.map((row) => row.serieA);
    return multiSeriesData.map((row, i) => ({
      ...row,
      maRef: getTrailingMovingAverageBefore(serieAValues, i),
    }));
  }, [multiSeriesData]);

  /** Evita superponer MA y serie principal cuando coinciden (p. ej. todo en 1): se ve “bicolor” por el trazo discontinuo. */
  const showMaRefOnCartesian = useMemo(() => {
    if (isTicketDistributionSource(widget.dataSource)) return false;
    if (numericValues.length < 2) return false;
    const minV = Math.min(...numericValues);
    const maxV = Math.max(...numericValues);
    const span = Math.max(maxV - minV, 1e-9);
    const eps = Math.max(1e-9, span * 0.015);
    for (let i = 1; i < numericValues.length; i += 1) {
      const ma = getTrailingMovingAverageBefore(numericValues, i);
      if (ma != null && Math.abs(numericValues[i] - ma) > eps) return true;
    }
    return false;
  }, [numericValues, widget.dataSource]);

  const showMaRefOnStackedArea = useMemo(() => {
    if (isTicketDistributionSource(widget.dataSource)) return false;
    const serieA = multiSeriesData.map((row) => row.serieA);
    if (serieA.length < 2) return false;
    const span = Math.max(Math.max(...serieA) - Math.min(...serieA), 1e-9);
    const eps = Math.max(1e-9, span * 0.015);
    for (let i = 1; i < serieA.length; i += 1) {
      const ma = getTrailingMovingAverageBefore(serieA, i);
      if (ma != null && Math.abs(serieA[i] - ma) > eps) return true;
    }
    return false;
  }, [multiSeriesData, widget.dataSource]);

  const dataMin = useMemo(() => (numericValues.length ? Math.min(...numericValues) : 0), [numericValues]);
  const dataMax = useMemo(() => (numericValues.length ? Math.max(...numericValues) : 1), [numericValues]);
  const dataSpan = Math.max(1, dataMax - dataMin);
  const yDomainMin = Math.max(0, dataMin - dataSpan * 0.2);
  const yDomainMax = dataMax + dataSpan * 0.25;

  const cardInsightLine = useMemo(
    () => getCardInsightLine(widget.dataSource, sourceData, numericValues, metricFormat),
    [widget.dataSource, sourceData, numericValues, metricFormat],
  );

  const a11ySummaryId = useMemo(() => `widget-a11y-${widget.id}`, [widget.id]);
  const a11ySummaryText = useMemo(() => {
    const parts = [widget.title, dataSourceLabel, dataSourceMicrocopy];
    if (cardInsightLine) parts.push(cardInsightLine);
    if (!sourceData || sourceData.length === 0) parts.push("Sin datos para mostrar");
    return parts.join(". ");
  }, [widget.title, dataSourceLabel, dataSourceMicrocopy, cardInsightLine, sourceData]);

  const executiveTooltipContent = useCallback(
    (props: unknown) => {
      const { active, payload, label } = props as ExecutiveTooltipProps;
      if (!active || !payload || payload.length === 0) return null;
      const ticketDist = isTicketDistributionSource(widget.dataSource);
      const { title: tooltipTitle, rowIndex: tooltipRowIndex } = resolveTooltipContext(
        label,
        payload,
        sourceData,
        widget.dataSource,
      );
      const primaryCurrent =
        tooltipRowIndex >= 0
          ? numericValues[tooltipRowIndex] ?? 0
          : typeof payload[0]?.value === "number"
            ? payload[0].value
            : Number(payload[0]?.value ?? 0);
      const totalAgg = numericValues.reduce((s, v) => s + v, 0);
      const sharePct =
        ticketDist && totalAgg > 1e-9 && tooltipRowIndex >= 0
          ? ((primaryCurrent / totalAgg) * 100).toFixed(1)
          : null;
      const shareBlock =
        sharePct != null ? (
          <p className="mt-1 text-[10px] text-[var(--color-text-3)]">
            {sharePct}% del total ({formatMetric(totalAgg, metricFormat)})
          </p>
        ) : null;

      const ma = getTrailingMovingAverageBefore(numericValues, tooltipRowIndex);
      const maWindow = tooltipRowIndex >= 1 ? Math.min(5, tooltipRowIndex) : 0;
      let deltaVsMa: number | null = null;
      if (!ticketDist && tooltipRowIndex >= 1 && ma != null && Math.abs(ma) > 1e-9) {
        deltaVsMa = ((primaryCurrent - ma) / ma) * 100;
      }
      const isUp = deltaVsMa != null && deltaVsMa >= 0;
      const deltaBlock =
        !ticketDist && tooltipRowIndex >= 1 && deltaVsMa != null && Number.isFinite(deltaVsMa) ? (
          <p className={cn("mt-1 text-[10px] font-medium", isUp ? "text-emerald-400" : "text-rose-400")}>
            {isUp ? "▲" : "▼"} {Math.abs(deltaVsMa).toFixed(1)}% vs MA serie principal ({maWindow} pts)
          </p>
        ) : !ticketDist && tooltipRowIndex >= 1 && ma != null && Math.abs(ma) <= 1e-9 ? (
          <p className="mt-1 text-[10px] text-[var(--color-text-3)]">Referencia MA ~ 0 (sin delta %)</p>
        ) : null;

      if (payload.length > 1) {
        const rowSeriesValues = payload.map((p) => Number(p.value ?? 0));
        const stackTotal = rowSeriesValues.reduce((s, v) => (Number.isFinite(v) ? s + v : s), 0);
        let stackHighlightIdx = 0;
        let stackMax = -Infinity;
        rowSeriesValues.forEach((v, i) => {
          if (Number.isFinite(v) && v > stackMax) {
            stackMax = v;
            stackHighlightIdx = i;
          }
        });
        return (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 shadow-xl min-w-[140px] max-w-[280px]">
            <p className="text-[10px] text-[var(--color-text-3)] mb-1.5">
              {tooltipTitle} · multi-serie
            </p>
            <div className="max-h-36 space-y-1 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
              {payload.map((item, idx) => (
                <div key={`${String(item.dataKey)}-${idx}`} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-[var(--color-text-3)]">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: item.color ?? "#94a3b8" }} />
                    <span className="truncate">{String(item.name ?? item.dataKey ?? "")}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-[var(--color-text-1)]">
                    {formatMetric(item.value as number | string, metricFormat)}
                  </span>
                </div>
              ))}
            </div>
            {stackTotal > 1e-9 ? (
              <div className="mt-1.5 space-y-1 border-t border-[var(--color-border)] pt-1.5">
                <p className="text-[10px] font-medium text-[var(--color-text-2)]">
                  Total apilado: {formatMetric(stackTotal, metricFormat)}
                </p>
                <p className="text-[10px] text-[var(--color-text-3)]">Parte de cada serie en esta categoria:</p>
                <div className="max-h-24 space-y-0.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
                  {payload.map((item, idx) => {
                    const v = Number(item.value ?? 0);
                    const pct = stackTotal > 1e-9 ? ((v / stackTotal) * 100).toFixed(1) : "0.0";
                    return (
                      <p key={`pct-${String(item.dataKey)}-${idx}`} className="text-[10px] text-[var(--color-text-3)] tabular-nums">
                        {String(item.name ?? item.dataKey ?? "")}: {pct}% ({formatMetric(v, metricFormat)})
                      </p>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <MiniSparkline
              values={rowSeriesValues.length >= 2 ? rowSeriesValues : numericValues}
              highlightIndex={rowSeriesValues.length >= 2 ? stackHighlightIdx : tooltipRowIndex >= 0 ? tooltipRowIndex : 0}
              accentColor={accentColor}
            />
          </div>
        );
      }

      const raw = payload[0]?.value;
      const current = typeof raw === "number" ? raw : Number(raw ?? 0);
      return (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 shadow-xl min-w-[120px]">
          <p className="text-[10px] text-[var(--color-text-3)] mb-1">{tooltipTitle}</p>
          <p className="text-base font-semibold leading-none text-[var(--color-text-1)]">{formatMetric(current, metricFormat)}</p>
          <MiniSparkline
            values={numericValues}
            highlightIndex={tooltipRowIndex >= 0 ? tooltipRowIndex : 0}
            accentColor={accentColor}
          />
          {shareBlock}
          {deltaBlock}
        </div>
      );
    },
    [accentColor, metricFormat, numericValues, sourceData, widget.dataSource],
  );

  useEffect(() => {
    setIsTransitioning(true);
    const timeout = setTimeout(() => setIsTransitioning(false), transitionBySize.durationMs);
    return () => clearTimeout(timeout);
  }, [widget.chartType, widget.size, widget.config, sourceData.length, transitionBySize.durationMs]);

  type TreemapContentProps = {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    name?: string | number;
    fill?: string;
  };
  const renderTreemapCell = (props: TreemapContentProps) => {
    const { x = 0, y = 0, width = 0, height = 0, name, fill } = props;
    if (width <= 0 || height <= 0) return <g />;
    const showLabel = width > 56 && height > 26;
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill ?? accentColor}
          fillOpacity={0.82}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
          rx={4}
          ry={4}
        />
        {showLabel ? (
          <text x={x + 8} y={y + 16} fill="var(--color-text-1)" fontSize={10} fontWeight={600}>
            {String(name ?? "")}
          </text>
        ) : null}
      </g>
    );
  };

  const embedCardClass = cn(
    "flex h-full min-h-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] relative",
    cardPaddingClass,
    isEditing && "ring-1 ring-[var(--color-accent)]/40",
    isKeyboardFocused && "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-surface)]",
  );

  const embedHeader = (
    <div className={cn("mb-3 shrink-0 border-b border-[var(--color-border)] pb-3 flex items-start justify-between", presentationMode && "pb-2")}>
      <div>
        <h3 className={cn("text-subheading", isEditing && "pl-5", presentationMode && "text-[15px]")}>{widget.title}</h3>
        <p className={cn("text-caption text-[var(--color-text-3)] mt-1", isEditing && "pl-5")}>{dataSourceLabel}</p>
        <p className={cn("text-[10px] text-[var(--color-text-3)] mt-1", isEditing && "pl-5")}>{dataSourceMicrocopy}</p>
      </div>
      <div className={cn("flex items-center gap-2", presentationMode && "hidden")}>
        {isEditing && onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(widget.id)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-all"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );

  if (widget.dataSource === "embed_tickets") {
    return (
      <div
        ref={exportRootRef}
        role="region"
        aria-label={widget.title}
        onMouseDown={() => onWidgetPaneMouseDown?.()}
        className={embedCardClass}
      >
        {embedHeader}
        <div className="min-h-0 flex-1 overflow-auto [-webkit-overflow-scrolling:touch]">
          <TicketsBandejaWidget />
        </div>
      </div>
    );
  }

  if (widget.dataSource === "embed_inventory") {
    return (
      <div
        ref={exportRootRef}
        role="region"
        aria-label={widget.title}
        onMouseDown={() => onWidgetPaneMouseDown?.()}
        className={embedCardClass}
      >
        {embedHeader}
        <div className="min-h-0 flex-1 overflow-auto">
          <InventoryCompactWidget />
        </div>
      </div>
    );
  }

  if (widget.dataSource === "embed_map") {
    return (
      <div
        ref={exportRootRef}
        role="region"
        aria-label={widget.title}
        onMouseDown={() => onWidgetPaneMouseDown?.()}
        className={embedCardClass}
      >
        {embedHeader}
        <div className="min-h-0 flex-1 space-y-3 p-2 text-sm leading-relaxed text-[var(--color-text-2)]">
          <p>
            El mapa embebido en dashboards ya no está disponible. Para la vista geográfica usa la pantalla{" "}
            <Link className="font-medium text-[var(--color-accent)] underline-offset-2 hover:underline" href="/mapa">
              Mapa
            </Link>{" "}
            o añade el widget de bandeja de tickets.
          </p>
          {isEditing ? (
            <p className="text-caption text-[var(--color-text-3)]">
              En modo edición puedes eliminar este bloque o cambiar su fuente de datos desde la barra del widget.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (widget.dataSource === "embed_preventive") {
    return (
      <div
        ref={exportRootRef}
        role="region"
        aria-label={widget.title}
        onMouseDown={() => onWidgetPaneMouseDown?.()}
        className={embedCardClass}
      >
        {embedHeader}
        <div className="max-h-[min(420px,55vh)] min-h-0 flex-1 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch]">
          <DashboardPreventiveAgenda />
        </div>
      </div>
    );
  }

  if (widget.dataSource === "operation_links") {
    return (
      <div
        ref={exportRootRef}
        role="region"
        aria-label={widget.title}
        onMouseDown={() => onWidgetPaneMouseDown?.()}
        className={cn(
          "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] relative",
          cardPaddingClass,
          isEditing && "ring-1 ring-[var(--color-accent)]/40",
          isKeyboardFocused && "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-surface)]",
        )}
      >
        <div className={cn("mb-3 border-b border-[var(--color-border)] pb-3 flex items-start justify-between", presentationMode && "pb-2")}>
          <div>
            <h3 className={cn("text-subheading", isEditing && "pl-5", presentationMode && "text-[15px]")}>{widget.title}</h3>
            <p className={cn("text-caption text-[var(--color-text-3)] mt-1", isEditing && "pl-5")}>{dataSourceLabel}</p>
            <p className={cn("text-[10px] text-[var(--color-text-3)] mt-1", isEditing && "pl-5")}>{dataSourceMicrocopy}</p>
          </div>
          <div className={cn("flex items-center gap-2", presentationMode && "hidden")}>
            {isEditing && onRemove ? (
              <button
                onClick={() => onRemove(widget.id)}
                className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-all"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>
        <ul className="space-y-2">
          {OPERATION_QUICK_LINKS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm text-[var(--color-text-1)] transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)]"
              >
                <span className="font-medium text-[var(--color-accent)]">{item.label}</span>
                <span className="text-[11px] text-[var(--color-text-3)]">{item.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!sourceData || sourceData.length === 0) {
    return (
      <div
        ref={exportRootRef}
        role="region"
        aria-label={widget.title}
        aria-describedby={a11ySummaryId}
        onMouseDown={() => onWidgetPaneMouseDown?.()}
        className={cn(
          "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] relative",
          cardPaddingClass,
          isEditing && "ring-1 ring-[var(--color-accent)]/40",
          isKeyboardFocused && "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-surface)]",
        )}
      >
        <div className={cn("mb-3 border-b border-[var(--color-border)] pb-3 flex items-start justify-between", presentationMode && "pb-2")}>
          <div>
            <h3 className={cn("text-subheading", isEditing && "pl-5", presentationMode && "text-[15px]")}>{widget.title}</h3>
            <p className={cn("text-caption text-[var(--color-text-3)] mt-1", isEditing && "pl-5")}>{dataSourceLabel}</p>
            <p className={cn("text-[10px] text-[var(--color-text-3)] mt-1", isEditing && "pl-5")}>{dataSourceMicrocopy}</p>
          </div>
          <div className={cn("flex items-center gap-2", presentationMode && "hidden")}>
            {isEditing && onRemove ? (
              <button
                onClick={() => onRemove(widget.id)}
                className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-all"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex h-[220px] flex-col items-center justify-center text-[var(--color-text-3)] gap-2">
          <p className="text-caption text-center">{emptyState.title}</p>
          <p className="text-[11px] text-[var(--color-text-3)] text-center max-w-[260px]">{emptyState.action}</p>
          {isEditing && onQuickChangeSource ? (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 max-w-[280px]">
              {QUICK_DATA_SOURCES.filter((source) => source.id !== widget.dataSource).map((source) => (
                <button
                  key={source.id}
                  onClick={() => onQuickChangeSource(widget.id, source.id)}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)] hover:border-[var(--color-border-hover)] transition-all"
                >
                  {source.label}
                </button>
              ))}
            </div>
          ) : null}
          {!isEditing && onRequestEdit ? (
            <button
              onClick={onRequestEdit}
              className="mt-1 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)] hover:border-[var(--color-border-hover)] transition-all"
            >
              Editar widget
            </button>
          ) : null}
        </div>
        <span id={a11ySummaryId} className="sr-only">
          {a11ySummaryText}
        </span>
      </div>
    );
  }

  const chartContent = (() => {
    if (widget.chartType === "area") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <AreaChart data={sourceDataWithMaRef} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
              {showGrid ? <CartesianGrid strokeDasharray={CHART_THEME.grid.dash} stroke={CHART_THEME.grid.stroke} vertical={false} /> : null}
              <XAxis
                dataKey={widget.dataSource === "sla_compliance" ? "day" : "name"}
                tick={tickBySize}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={tickBySize} tickFormatter={formatTick} axisLine={false} tickLine={false} />
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactLegend}
              <Area
                type={smoothLines ? "monotone" : "linear"}
                dataKey={widget.dataSource === "sla_compliance" ? "cumplido" : "value"}
                stroke={accentColor}
                fill={accentColor}
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={renderColoredDot}
              />
              {showMaRefOnCartesian ? (
                <Line
                  type={smoothLines ? "monotone" : "linear"}
                  dataKey="maRef"
                  name="MA ref."
                  legendType="none"
                  stroke="rgba(148,163,184,0.82)"
                  strokeWidth={1.25}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "bar") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <BarChart data={sourceData}>
              {showGrid ? <CartesianGrid strokeDasharray={CHART_THEME.grid.dash} stroke={CHART_THEME.grid.stroke} vertical={false} /> : null}
              <XAxis
                dataKey={widget.dataSource === "sla_compliance" ? "day" : "name"}
                tick={tickBySize}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={tickBySize} tickFormatter={formatTick} axisLine={false} tickLine={false} />
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactLegend}
              <Bar dataKey={widget.dataSource === "sla_compliance" ? "cumplido" : "value"} radius={[4, 4, 0, 0]}>
                {sourceData.map((_, index) => (
                  <Cell key={index} fill={entryColors[index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "stacked_bar") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <BarChart data={multiSeriesData}>
              {showGrid ? <CartesianGrid strokeDasharray={CHART_THEME.grid.dash} stroke={CHART_THEME.grid.stroke} vertical={false} /> : null}
              <XAxis dataKey="name" tick={tickBySize} axisLine={false} tickLine={false} />
              <YAxis tick={tickBySize} tickFormatter={formatTick} axisLine={false} tickLine={false} />
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactStackedLegend}
              <Bar dataKey="serieA" name={stackedLabels.serieA} stackId="total" fill={palette[0]} radius={[3, 3, 0, 0]} />
              <Bar dataKey="serieB" name={stackedLabels.serieB} stackId="total" fill={palette[1]} />
              <Bar dataKey="serieC" name={stackedLabels.serieC} stackId="total" fill={palette[2]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "pie") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <PieChart>
              <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                {sourceData.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={entryColors[index]} />
                ))}
              </Pie>
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactLegend}
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "rose") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <PieChart>
              <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={25} outerRadius={88} cx="50%" cy="46%">
                {sourceData.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={entryColors[index]} />
                ))}
              </Pie>
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactLegend}
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "line") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <LineChart data={sourceDataWithMaRef}>
              {showGrid ? <CartesianGrid strokeDasharray={CHART_THEME.grid.dash} stroke={CHART_THEME.grid.stroke} vertical={false} /> : null}
              <XAxis
                dataKey={widget.dataSource === "sla_compliance" ? "day" : "name"}
                tick={tickBySize}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={tickBySize} tickFormatter={formatTick} axisLine={false} tickLine={false} />
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactLegend}
              <Line
                type={smoothLines ? "monotone" : "linear"}
                dataKey={widget.dataSource === "sla_compliance" ? "cumplido" : "value"}
                stroke={accentColor}
                strokeWidth={2}
                dot={renderColoredDot}
              />
              {showMaRefOnCartesian ? (
                <Line
                  type={smoothLines ? "monotone" : "linear"}
                  dataKey="maRef"
                  name="MA ref."
                  legendType="none"
                  stroke="rgba(148,163,184,0.82)"
                  strokeWidth={1.25}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "stacked_area") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <AreaChart data={multiSeriesDataWithMaRef} margin={{ top: 6, right: 4, left: -20, bottom: 0 }}>
              {showGrid ? <CartesianGrid strokeDasharray={CHART_THEME.grid.dash} stroke={CHART_THEME.grid.stroke} vertical={false} /> : null}
              <XAxis dataKey="name" tick={tickBySize} axisLine={false} tickLine={false} />
              <YAxis tick={tickBySize} tickFormatter={formatTick} axisLine={false} tickLine={false} />
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactStackedLegend}
              <Area
                type={smoothLines ? "monotone" : "linear"}
                dataKey="serieA"
                name={stackedLabels.serieA}
                stackId="1"
                stroke={palette[0]}
                fill={palette[0]}
                fillOpacity={0.4}
              />
              <Area
                type="monotone"
                dataKey="serieB"
                name={stackedLabels.serieB}
                stackId="1"
                stroke={palette[1]}
                fill={palette[1]}
                fillOpacity={0.35}
              />
              <Area
                type="monotone"
                dataKey="serieC"
                name={stackedLabels.serieC}
                stackId="1"
                stroke={palette[2]}
                fill={palette[2]}
                fillOpacity={0.3}
              />
              {showMaRefOnStackedArea ? (
                <Line
                  type={smoothLines ? "monotone" : "linear"}
                  dataKey="maRef"
                  name="MA ref. (serie A)"
                  legendType="none"
                  stroke="rgba(148,163,184,0.9)"
                  strokeWidth={1.25}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "bar_horizontal") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <BarChart
              data={sourceData}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 48, bottom: 4 }}
            >
              {showGrid ? <CartesianGrid strokeDasharray={CHART_THEME.grid.dash} stroke={CHART_THEME.grid.stroke} horizontal={false} /> : null}
              <XAxis
                type="number"
                tick={tickBySize}
                tickFormatter={formatTick}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={tickBySize}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactLegend}
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {sourceData.map((_, index) => (
                  <Cell key={index} fill={entryColors[index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "composed") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <ComposedChart data={sourceData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              {showGrid ? <CartesianGrid strokeDasharray={CHART_THEME.grid.dash} stroke={CHART_THEME.grid.stroke} vertical={false} /> : null}
              <XAxis dataKey="name" tick={tickBySize} axisLine={false} tickLine={false} />
              <YAxis tick={tickBySize} tickFormatter={formatTick} axisLine={false} tickLine={false} />
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactLegend}
              <Bar dataKey="value" fillOpacity={0.8} radius={[4, 4, 0, 0]}>
                {sourceData.map((_, index) => (
                  <Cell key={index} fill={entryColors[index]} />
                ))}
              </Bar>
              <Line type={smoothLines ? "monotone" : "linear"} dataKey="value" stroke={accentColor} strokeWidth={2} dot={renderColoredDot} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "radar") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <RadarChart data={sourceData}>
              <PolarGrid stroke="rgba(148,163,184,0.15)" />
              <PolarAngleAxis dataKey="name" tick={tickBySize} />
              <PolarRadiusAxis tick={tickBySize} tickFormatter={formatTick} axisLine={false} />
              <Radar dataKey="value" stroke={accentColor} fill={accentColor} fillOpacity={0.25} strokeWidth={1.5} />
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactLegend}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "radialbar") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <RadialBarChart
              innerRadius="20%"
              outerRadius="90%"
              data={sourceData.map((d, index) => ({
                ...d,
                fill: entryColors[index],
              }))}
              startAngle={180}
              endAngle={0}
            >
              <RadialBar dataKey="value" cornerRadius={4} />
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactLegend}
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "scatter") {
      const scatterData = sourceData.map((d, i) => ({
        x: i + 1,
        y: typeof d.value === "number" ? d.value : Number(d.value),
        name: String(d.name),
        fill: entryColors[i],
      }));

      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <ScatterChart margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              {showGrid ? <CartesianGrid strokeDasharray={CHART_THEME.grid.dash} stroke={CHART_THEME.grid.stroke} /> : null}
              <XAxis
                dataKey="x"
                type="number"
                name="índice"
                tick={tickBySize}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="y"
                type="number"
                name="valor"
                domain={[yDomainMin, yDomainMax]}
                tick={tickBySize}
                tickFormatter={formatTick}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={executiveTooltipContent}
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={CHART_THEME.tooltip.contentStyle}
              />
              {compactLegend}
              <Scatter
                data={scatterData}
                fillOpacity={0.9}
                shape={(props: { cx?: number; cy?: number; payload?: { fill?: string } }) => {
                  const { cx, cy, payload } = props ?? {};
                  if (cx == null || cy == null) return null;
                  const fill = payload?.fill ?? accentColor;
                  return <circle cx={cx} cy={cy} r={4} fill={fill} />;
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "bubble") {
      const bubbleData = sourceData.map((d, i) => {
        const value = typeof d.value === "number" ? d.value : Number(d.value ?? 0);
        return {
          x: i + 1,
          y: value,
          z: Math.max(40, value * 6),
          name: String(d.name ?? `Serie ${i + 1}`),
          fill: entryColors[i],
        };
      });

      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <ScatterChart margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              {showGrid ? <CartesianGrid strokeDasharray={CHART_THEME.grid.dash} stroke={CHART_THEME.grid.stroke} /> : null}
              <XAxis dataKey="x" type="number" tick={tickBySize} axisLine={false} tickLine={false} />
              <YAxis
                dataKey="y"
                type="number"
                domain={[yDomainMin, yDomainMax]}
                tick={tickBySize}
                tickFormatter={formatTick}
                axisLine={false}
                tickLine={false}
              />
              <ZAxis dataKey="z" range={[36, 260]} />
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
              />
              {compactLegend}
              <Scatter data={bubbleData} fillOpacity={0.75}>
                {bubbleData.map((point, index) => (
                  <Cell key={`${point.name}-${index}`} fill={point.fill} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.chartType === "treemap") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <Treemap
              data={sourceData}
              dataKey="value"
              nameKey="name"
              stroke="rgba(255,255,255,0.08)"
              fill={accentColor}
              content={renderTreemapCell}
            >
              {sourceData.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={entryColors[index]} />
              ))}
            </Treemap>
          </ResponsiveContainer>
          {compactLegend}
        </div>
      );
    }

    if (widget.chartType === "sankey") {
      const sankeyNodes = [{ name: "Total" }, ...sourceData.map((entry) => ({ name: getEntryLabel(entry) }))];
      const sankeyLinks = sourceData.map((entry, index) => ({
        source: 0,
        target: index + 1,
        value: Math.max(1, typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0)),
        fill: entryColors[index],
      }));

      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <Sankey
              data={{ nodes: sankeyNodes, links: sankeyLinks }}
              nodePadding={16}
              nodeWidth={10}
              link={{
                strokeOpacity: 0.58,
                stroke: "rgba(148,163,184,0.42)",
              }}
              node={{ fill: "rgba(37,99,235,0.55)", stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }}
              margin={{ top: 8, right: 12, bottom: 8, left: 12 }}
            >
              {sankeyLinks.map((link, index) => (
                <Cell key={`sankey-link-${index}`} fill={link.fill} />
              ))}
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
            </Sankey>
          </ResponsiveContainer>
          {compactLegend}
        </div>
      );
    }

    if (widget.chartType === "funnel") {
      return (
        <div style={{ width: "100%", height: responsiveChartHeight }}>
          <ResponsiveContainer width="100%" height={responsiveChartHeight}>
            <FunnelChart>
              <Tooltip
                content={executiveTooltipContent}
                contentStyle={CHART_THEME.tooltip.contentStyle}
                labelStyle={CHART_THEME.tooltip.labelStyle}
              />
              {compactLegend}
              <Funnel
                dataKey="value"
                data={sourceData.map((d, index) => ({
                  ...d,
                  fill: entryColors[index],
                }))}
                isAnimationActive
              >
                <LabelList position="center" fill="var(--color-text-1)" fontSize={11} />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
      );
    }

    return <div className="text-caption">Tipo de gráfica no soportado</div>;
  })();

  return (
    <div
      ref={exportRootRef}
      role="region"
      aria-label={widget.title}
      aria-describedby={a11ySummaryId}
      onMouseDown={() => onWidgetPaneMouseDown?.()}
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] relative",
        cardPaddingClass,
        isEditing && "ring-1 ring-[var(--color-accent)]/40",
        isKeyboardFocused && "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-surface)]",
      )}
    >
      <div className={cn("mb-3 border-b border-[var(--color-border)] pb-3 flex items-start justify-between", presentationMode && "pb-2")}>
        <div>
          <h3 className={cn("text-subheading", isEditing && "pl-5", presentationMode && "text-[15px]")}>{widget.title}</h3>
          <p className={cn("text-caption text-[var(--color-text-3)] mt-1", isEditing && "pl-5")}>{dataSourceLabel}</p>
          <p className={cn("text-[10px] text-[var(--color-text-3)] mt-1", isEditing && "pl-5")}>{dataSourceMicrocopy}</p>
          {cardInsightLine ? (
            <p className={cn("text-[10px] text-[var(--color-text-2)] mt-1.5 leading-snug", isEditing && "pl-5")}>{cardInsightLine}</p>
          ) : null}
        </div>
        <div className={cn("flex items-center gap-2", presentationMode && "hidden")}>
          {isEditing && onRemove ? (
            <button
              onClick={() => onRemove(widget.id)}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-all"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>
      {isEditing && !presentationMode ? (
        <div className="mb-2 flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
          <button
            onClick={() => onDuplicate?.(widget.id)}
            className="rounded-md p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Duplicar widget"
          >
            <Copy size={13} />
          </button>
          <button
            onClick={() => onQuickToggleLegend?.(widget.id)}
            className="rounded-md p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Alternar leyenda"
          >
            <EyeOff size={13} />
          </button>
          <button
            onClick={() => onQuickCycleChartType?.(widget.id)}
            className="rounded-md p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Cambiar tipo grafico"
          >
            <Wand2 size={13} />
          </button>
          <button
            onClick={() => onQuickResetVisual?.(widget.id)}
            className="rounded-md p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Reset visual"
          >
            <RotateCcw size={13} />
          </button>
          {onExportWidget ? (
            <button
              type="button"
              onClick={() => onExportWidget()}
              className="rounded-md p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              aria-label="Exportar widget PNG"
            >
              <Download size={13} />
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        style={{ transitionDelay: `${animationDelayMs}ms` }}
        className={cn(
          "transition-all will-change-transform",
          transitionBySize.className,
          isTransitioning
            ? cn(transitionBySize.transitionOpacityClass, getChartEntryAnimationClass(widget.chartType, widget.size))
            : "opacity-100 translate-y-0 translate-x-0 scale-100",
        )}
      >
        {chartContent}
      </div>
      <span id={a11ySummaryId} className="sr-only">
        {a11ySummaryText}
      </span>
    </div>
  );
}
