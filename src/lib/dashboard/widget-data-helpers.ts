import type { CustomDashboardData } from "@/lib/dashboard/dashboard-data-types";
import { isEmbedDataSource } from "@/lib/dashboard/data-sources";

type Row = Record<string, string | number>;

/** Obtiene filas de datos para una fuente analítica del payload del dashboard. */
export function getAnalyticsRows(data: CustomDashboardData, dataSource: string): Row[] {
  if (dataSource === "manual") return [];
  if (dataSource.startsWith("kpi_") || dataSource.startsWith("embed_") || dataSource === "operation_links") {
    return [];
  }

  const key = dataSource as keyof CustomDashboardData;
  const raw = data[key];
  if (!Array.isArray(raw)) return [];

  if (dataSource === "tickets_trend") {
    return (raw as CustomDashboardData["tickets_trend"]).map((row) => ({
      name: row.day,
      day: row.day,
      value: row.creados,
      creados: row.creados,
      resueltos: row.resueltos,
    }));
  }

  if (dataSource === "sla_compliance") {
    return (raw as CustomDashboardData["sla_compliance"]).map((row) => ({
      name: row.day,
      day: row.day,
      value: row.cumplido,
      cumplido: row.cumplido,
      incumplido: row.incumplido,
    }));
  }

  return raw as Row[];
}

export function getEntryLabel(entry: Row) {
  return String(entry.day ?? entry.name ?? "");
}

function buildShiftComparisonMultiSeries(sourceData: Row[]) {
  const shifts = [
    { name: "Mañana", ayer: 0, hoy: 0 },
    { name: "Tarde", ayer: 0, hoy: 0 },
    { name: "Noche", ayer: 0, hoy: 0 },
  ];

  for (const entry of sourceData) {
    const label = String(entry.name ?? "");
    const value = Number(entry.value ?? 0);
    const shift = shifts.find((item) => label.startsWith(item.name));
    if (!shift) continue;
    if (/ayer/i.test(label)) shift.ayer = value;
    else if (/hoy/i.test(label)) shift.hoy = value;
  }

  return shifts.map(({ name, ayer, hoy }) => ({
    name,
    serieA: ayer,
    serieB: hoy,
    serieC: 0,
  }));
}

export function buildMultiSeriesData(sourceData: Row[], dataSource: string) {
  if (dataSource === "shift_comparison") {
    return buildShiftComparisonMultiSeries(sourceData);
  }

  return sourceData.map((entry) => {
    const baseLabel = getEntryLabel(entry);

    if (dataSource === "tickets_trend") {
      return {
        name: baseLabel,
        serieA: Number(entry.creados ?? 0),
        serieB: Number(entry.resueltos ?? 0),
        serieC: 0,
      };
    }

    if (dataSource === "sla_compliance") {
      return {
        name: baseLabel,
        serieA: Number(entry.cumplido ?? 0),
        serieB: Number(entry.incumplido ?? 0),
        serieC: 0,
      };
    }

    const mainValue = Number(entry.value ?? 0);
    return {
      name: baseLabel,
      serieA: Math.max(0, mainValue),
      serieB: 0,
      serieC: 0,
    };
  });
}

export type StackedSeriesKey = "serieA" | "serieB" | "serieC";

export function getActiveStackedSeriesKeys(
  multiSeriesData: ReadonlyArray<{ serieA: number; serieB: number; serieC: number }>,
): StackedSeriesKey[] {
  const keys: StackedSeriesKey[] = ["serieA", "serieB", "serieC"];
  return keys.filter((key) => multiSeriesData.some((row) => (row[key] ?? 0) > 0));
}

export function isComparisonMultiSeriesSource(dataSource: string) {
  return dataSource === "shift_comparison";
}

export type ScatterPoint = {
  name: string;
  xIndex: number;
  y: number;
  z: number;
  fill: string;
};

/** Puntos scatter/bubble con eje X categórico (índice + etiqueta legible). */
export function buildScatterSeries(sourceData: Row[], entryColors: readonly string[]): ScatterPoint[] {
  return sourceData.map((entry, index) => {
    const y = Number(entry.value ?? entry.creados ?? entry.cumplido ?? 0);
    const safeY = Number.isFinite(y) ? y : 0;
    return {
      name: getEntryLabel(entry) || `Item ${index + 1}`,
      xIndex: index,
      y: safeY,
      z: Math.max(40, safeY * 6),
      fill: entryColors[index] ?? entryColors[0] ?? "#2563EB",
    };
  });
}

export function formatScatterCategoryTick(sourceData: Row[], index: number): string {
  const label = getEntryLabel(sourceData[index] ?? {});
  if (!label) return String(index + 1);
  return label.length > 12 ? `${label.slice(0, 11)}…` : label;
}

export type SankeyGraph = {
  nodes: { name: string }[];
  links: { source: number; target: number; value: number; fill?: string }[];
};

const STATUS_PIPELINE = ["Abierto", "En Proceso", "Esperando Repuesto", "Resuelto"] as const;
const PRIORITY_ORDER = ["Alta", "Media", "Baja"] as const;

function lookupRowValue(sourceData: Row[], name: string): number {
  const row = sourceData.find((entry) => getEntryLabel(entry) === name);
  return Math.max(0, Number(row?.value ?? 0));
}

function buildSplitSankeyGraph(
  rootLabel: string,
  sourceData: Row[],
  entryColors: readonly string[],
): SankeyGraph {
  const items = sourceData
    .map((entry, index) => ({
      name: getEntryLabel(entry) || `Item ${index + 1}`,
      value: Math.max(0, Number(entry.value ?? entry.creados ?? entry.cumplido ?? 0)),
      fill: entryColors[index],
    }))
    .filter((item) => item.value > 0);

  if (items.length === 0) {
    return { nodes: [{ name: rootLabel }], links: [] };
  }

  const nodes = [{ name: rootLabel }, ...items.map((item) => ({ name: item.name }))];
  const links = items.map((item, index) => ({
    source: 0,
    target: index + 1,
    value: Math.max(1, item.value),
    fill: item.fill,
  }));
  return { nodes, links };
}

function buildSequentialSankeyGraph(
  orderedNames: readonly string[],
  sourceData: Row[],
  entryColors: readonly string[],
): SankeyGraph {
  const nodes = orderedNames.map((name) => ({ name }));
  const links: SankeyGraph["links"] = [];

  for (let i = 0; i < orderedNames.length - 1; i += 1) {
    const targetValue = lookupRowValue(sourceData, orderedNames[i + 1]!);
    if (targetValue <= 0) continue;
    links.push({
      source: i,
      target: i + 1,
      value: Math.max(1, targetValue),
      fill: entryColors[i + 1] ?? entryColors[i],
    });
  }

  return { nodes, links };
}

function buildTimeSeriesSankeyGraph(
  sourceData: Row[],
  valueKey: "creados" | "cumplido" | "value",
  entryColors: readonly string[],
): SankeyGraph {
  if (sourceData.length === 0) return { nodes: [], links: [] };

  const nodes = sourceData.map((entry) => ({ name: getEntryLabel(entry) || "—" }));
  const links: SankeyGraph["links"] = [];

  for (let i = 0; i < sourceData.length - 1; i += 1) {
    const raw = sourceData[i + 1]?.[valueKey] ?? sourceData[i + 1]?.value ?? 0;
    const value = Math.max(0, Number(raw));
    if (value <= 0) continue;
    links.push({
      source: i,
      target: i + 1,
      value: Math.max(1, value),
      fill: entryColors[i + 1] ?? entryColors[i],
    });
  }

  return { nodes, links };
}

/** Topología Sankey según semántica de la fuente (pipeline, serie temporal o reparto). */
export function buildSankeyGraph(
  sourceData: Row[],
  dataSource: string,
  entryColors: readonly string[],
): SankeyGraph {
  if (sourceData.length === 0) return { nodes: [], links: [] };

  if (dataSource === "tickets_by_status" || dataSource === "backlog_by_status") {
    const sequential = buildSequentialSankeyGraph(STATUS_PIPELINE, sourceData, entryColors);
    if (sequential.links.length > 0) return sequential;
    return buildSplitSankeyGraph("Tickets", sourceData, entryColors);
  }

  if (dataSource === "tickets_by_priority" || dataSource === "mttr_by_priority") {
    return buildSplitSankeyGraph("Prioridad", sourceData, entryColors);
  }

  if (dataSource === "tickets_trend") {
    const series = buildTimeSeriesSankeyGraph(sourceData, "creados", entryColors);
    if (series.links.length > 0) return series;
    return buildSplitSankeyGraph("Tendencia", sourceData, entryColors);
  }

  if (dataSource === "sla_compliance") {
    const series = buildTimeSeriesSankeyGraph(sourceData, "cumplido", entryColors);
    if (series.links.length > 0) return series;
    return buildSplitSankeyGraph("SLA diario", sourceData, entryColors);
  }

  if (dataSource === "shift_comparison") {
    const nodes: SankeyGraph["nodes"] = [];
    const links: SankeyGraph["links"] = [];
    const shifts = ["Mañana", "Tarde", "Noche"];

    for (const shift of shifts) {
      const ayerRow = sourceData.find(
        (entry) => String(entry.name ?? "").startsWith(shift) && /ayer/i.test(String(entry.name)),
      );
      const hoyRow = sourceData.find(
        (entry) => String(entry.name ?? "").startsWith(shift) && /hoy/i.test(String(entry.name)),
      );
      const ayerValue = Math.max(0, Number(ayerRow?.value ?? 0));
      const hoyValue = Math.max(0, Number(hoyRow?.value ?? 0));
      if (ayerValue <= 0 && hoyValue <= 0) continue;

      const ayerIdx = nodes.length;
      nodes.push({ name: `${shift} ayer` });
      const hoyIdx = nodes.length;
      nodes.push({ name: `${shift} hoy` });
      links.push({
        source: ayerIdx,
        target: hoyIdx,
        value: Math.max(1, hoyValue || ayerValue),
        fill: entryColors[links.length] ?? entryColors[0],
      });
    }

    if (links.length > 0) return { nodes, links };
  }

  if (dataSource === "shift_load_today") {
    return buildSplitSankeyGraph("Carga turnos", sourceData, entryColors);
  }

  return buildSplitSankeyGraph("Total", sourceData, entryColors);
}

/** Fuentes embebidas obsoletas que ya no están en el catálogo. */
export const LEGACY_EMBED_DATA_SOURCES = ["embed_map"] as const;

export type LegacyEmbedMigrationTarget = {
  dataSource: string;
  title: string;
  label: string;
  hint: string;
};

export const LEGACY_EMBED_MIGRATIONS: Record<
  (typeof LEGACY_EMBED_DATA_SOURCES)[number],
  LegacyEmbedMigrationTarget[]
> = {
  embed_map: [
    {
      dataSource: "embed_tickets",
      title: "Bandeja activa",
      label: "Migrar a bandeja",
      hint: "Listado compacto de incidencias activas",
    },
    {
      dataSource: "embed_desvios",
      title: "Desvíos activos",
      label: "Migrar a desvíos",
      hint: "Vista geográfica operativa sustituta",
    },
  ],
};

export function isLegacyEmbedDataSource(dataSource: string): boolean {
  return (LEGACY_EMBED_DATA_SOURCES as readonly string[]).includes(dataSource);
}

export function buildNumericValues(sourceData: Row[], dataSource: string) {
  return sourceData.map((entry) => {
    if (dataSource === "sla_compliance") return Number(entry.cumplido ?? 0);
    if (dataSource === "tickets_trend") return Number(entry.creados ?? entry.value ?? 0);
    const raw = entry.value ?? 0;
    const value = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(value) ? value : 0;
  });
}

export function isMultiSeriesSource(dataSource: string) {
  return dataSource === "sla_compliance" || dataSource === "tickets_trend" || dataSource === "shift_comparison";
}

export function isTicketDistributionSource(dataSource: string) {
  return (
    dataSource === "tickets_by_status" ||
    dataSource === "backlog_by_status" ||
    dataSource === "tickets_by_operator" ||
    dataSource === "tickets_by_priority" ||
    dataSource === "tickets_by_municipio" ||
    dataSource === "top_buses" ||
    dataSource === "anomalous_buses" ||
    dataSource === "shift_load_today" ||
    dataSource === "shift_comparison" ||
    dataSource === "tickets_by_hour" ||
    dataSource === "mttr_by_priority" ||
    dataSource === "top_tecnicos"
  );
}

/** Enlace a bandeja filtrada desde un segmento de gráfica (drill-down). */
export function parseHourFromSegment(segmentName: string): number | null {
  const match = segmentName.trim().match(/^(\d{1,2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

/** Extrae turno M/T/N desde etiquetas tipo «Mañana (M)» o «M». */
export function parseShiftFromSegment(segmentName: string): "M" | "T" | "N" | null {
  const raw = segmentName.trim();
  const paren = raw.match(/\(([MTN])\)/i);
  if (paren) return paren[1].toUpperCase() as "M" | "T" | "N";
  const upper = raw.toUpperCase();
  if (upper === "M" || upper === "T" || upper === "N") return upper;
  const lower = raw.toLowerCase();
  if (lower.startsWith("mañana") || lower.startsWith("manana")) return "M";
  if (lower.startsWith("tarde")) return "T";
  if (lower.startsWith("noche")) return "N";
  return null;
}

export function getBandejaDrillHref(dataSource: string, segmentName?: string): string | null {
  if (!segmentName) return null;
  const name = segmentName.trim();
  if (!name) return null;
  if (dataSource === "tickets_by_priority" || dataSource === "mttr_by_priority") {
    const map: Record<string, string> = { Alta: "alta", Media: "media", Baja: "baja" };
    const p = map[name] ?? name.toLowerCase();
    return `/bandeja?priority=${encodeURIComponent(p)}`;
  }
  if (dataSource === "tickets_by_status" || dataSource === "backlog_by_status") {
    const map: Record<string, string> = {
      Abierto: "abierto",
      "En Proceso": "en_proceso",
      "Esperando Repuesto": "esperando_repuesto",
      Resuelto: "resuelto",
    };
    const s = map[name] ?? name.toLowerCase().replace(/\s+/g, "_");
    return `/bandeja?status=${encodeURIComponent(s)}`;
  }
  if (dataSource === "top_buses" || dataSource === "anomalous_buses") {
    const busId = name.split("·")[0]?.trim() ?? name;
    return `/bandeja?busId=${encodeURIComponent(busId)}`;
  }
  if (dataSource === "tickets_by_operator") {
    return `/bandeja?operator=${encodeURIComponent(name)}`;
  }
  if (dataSource === "tickets_by_municipio") {
    return `/bandeja?q=${encodeURIComponent(name)}`;
  }
  if (dataSource === "shift_load_today" || dataSource === "shift_comparison") {
    const shift = parseShiftFromSegment(name);
    if (shift) return `/bandeja?shift=${shift}&status=abierto`;
    return "/bandeja?status=abierto";
  }
  if (dataSource === "top_tecnicos") {
    return "/bandeja?status=resuelto";
  }
  if (dataSource === "tickets_by_hour") {
    const hour = parseHourFromSegment(name);
    if (hour != null) return `/bandeja?hour=${hour}`;
    return "/bandeja?status=todos";
  }
  return null;
}

export const QUICK_DATA_SOURCES = [
  { id: "backlog_by_status", label: "Backlog" },
  { id: "tickets_trend", label: "Tendencia" },
  { id: "kpi_open_tickets", label: "KPI Abiertos" },
  { id: "tickets_by_priority", label: "Prioridad" },
  { id: "sla_compliance", label: "SLA" },
  { id: "embed_tickets", label: "Bandeja" },
] as const;

export function getEmptyStateBySource(dataSource: string) {
  if (dataSource.startsWith("kpi_")) {
    return { title: "KPI sin valor disponible.", action: "Actualiza los datos del dashboard." };
  }
  if (dataSource === "tickets_trend") {
    return {
      title: "Sin actividad en el periodo.",
      action: "Amplía el rango de días o espera a que se registren tickets.",
    };
  }
  if (dataSource === "backlog_by_status") {
    return { title: "No hay tickets activos.", action: "Buena señal: backlog vacío." };
  }
  if (dataSource === "tickets_by_status") {
    return {
      title: "Sin tickets creados en el periodo.",
      action: "Amplía el rango temporal con el selector superior.",
    };
  }
  if (dataSource === "tickets_by_municipio" || dataSource === "top_buses" || dataSource === "anomalous_buses") {
    return { title: "Sin datos para el ranking.", action: "Prueba con un periodo más largo." };
  }
  if (dataSource === "tickets_by_hour") {
    return { title: "Sin tickets en el periodo.", action: "Amplía el rango de días." };
  }
  if (dataSource === "top_tecnicos" || dataSource === "mttr_by_priority") {
    return { title: "Sin resoluciones en 30 días.", action: "Aún no hay cierres recientes." };
  }
  if (dataSource === "sla_compliance") {
    return {
      title: "Sin resoluciones en el periodo.",
      action: "El SLA diario requiere tickets resueltos en cada día.",
    };
  }
  if (dataSource === "shift_comparison") {
    return {
      title: "Sin carga registrada en turnos.",
      action: "Compara ayer vs hoy cuando haya tickets en M/T/N.",
    };
  }
  if (dataSource === "manual") {
    return {
      title: "No hay datos manuales configurados.",
      action: "Añade un JSON válido en la configuración del widget.",
    };
  }
  return {
    title: "Sin datos para la fuente seleccionada.",
    action: "Cambia la fuente o amplía el periodo del dashboard.",
  };
}

export const CHART_TYPE_LABELS: Record<string, string> = {
  kpi: "KPI",
  area: "Área",
  bar: "Barras",
  stacked_bar: "Barras apiladas",
  bar_horizontal: "Barras horizontales",
  pie: "Donut",
  rose: "Rosa polar",
  line: "Líneas",
  stacked_area: "Área apilada",
  composed: "Compuesta",
  radar: "Radar",
  radialbar: "Barras radiales",
  scatter: "Dispersión",
  bubble: "Burbujas",
  treemap: "Treemap",
  sankey: "Sankey",
  funnel: "Embudo",
  embed: "Vista embebida",
};

export function getChartTypeLabel(type: string): string {
  return CHART_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

const EMBED_SOURCE_LABELS: Record<string, string> = {
  embed_tickets: "Bandeja",
  embed_preventive: "Preventivo",
  embed_desvios: "Desvíos",
  embed_health: "Salud ops",
  embed_handover: "Handover",
  embed_sla_urgent: "Urgentes SLA",
  operation_links: "Enlaces",
};

export function getEmbedSourceLabel(dataSource: string): string {
  return EMBED_SOURCE_LABELS[dataSource] ?? "Vista embebida";
}

export function isKpiWidget(chartType: string | undefined, dataSource: string | undefined): boolean {
  return chartType === "kpi" || Boolean(dataSource?.startsWith("kpi_"));
}

/** Clave de agrupación para chips del listado de dashboards. */
export function getWidgetChipKey(widget: { chartType?: string; dataSource?: string }): string {
  if (isKpiWidget(widget.chartType, widget.dataSource)) return "kpi";
  if (widget.dataSource && isEmbedDataSource(widget.dataSource)) return "embed";
  return (widget.chartType ?? "otro").toLowerCase();
}

export function getWidgetChipLabel(key: string, dataSource?: string): string {
  if (key === "kpi") return "KPI";
  if (key === "embed") return getEmbedSourceLabel(dataSource ?? "");
  return getChartTypeLabel(key);
}

/** Etiqueta legible para la serie principal en tooltips y leyendas. */
export function getPrimarySeriesName(dataSource: string, dataKey = "value"): string {
  if (dataSource === "tickets_trend") {
    if (dataKey === "resueltos") return "Resueltos";
    return "Creados";
  }
  if (dataSource === "sla_compliance") {
    if (dataKey === "incumplido") return "Fuera de plazo";
    return "En plazo";
  }
  if (dataSource === "shift_comparison") {
    if (dataKey === "serieB") return "Hoy";
    return "Ayer";
  }
  return "Valor";
}

export function resolveSeriesLabel(
  item: { name?: string | number; dataKey?: string | number },
  dataSource: string,
): string {
  const key = String(item.dataKey ?? "");
  const name = item.name != null ? String(item.name) : "";
  if (name && name !== key && !name.startsWith("MA ref")) return name;
  if (key === "maRef") return "Media móvil";
  if (key === "value" || key === "cumplido" || key === "creados") {
    return getPrimarySeriesName(dataSource, key);
  }
  if (key === "resueltos") return "Resueltos";
  if (key === "incumplido") return "Fuera de plazo";
  if (key === "serieA" || key === "serieB" || key === "serieC") return name || key;
  return name || key;
}

export const TOOLTIP_AUXILIARY_SERIES_KEYS = new Set(["maRef"]);

export const STAGGER_BAR_SERIES_PREFIX = "__stagger_";

export function isStaggerBarSeriesKey(key: string): boolean {
  return key.startsWith(STAGGER_BAR_SERIES_PREFIX);
}

/** Descompone barras categóricas en series independientes para animación escalonada. */
export function buildStaggeredCategoricalBarData(
  sourceData: Row[],
  xKey: string,
  valueKey: string,
): { data: Row[]; seriesKeys: string[] } {
  const seriesKeys = sourceData.map((_, index) => `${STAGGER_BAR_SERIES_PREFIX}${index}`);
  const data = sourceData.map((row, rowIndex) => {
    const point: Row = { [xKey]: row[xKey] };
    seriesKeys.forEach((key, colIndex) => {
      point[key] = colIndex === rowIndex ? Number(row[valueKey] ?? 0) : 0;
    });
    return point;
  });
  return { data, seriesKeys };
}

export function isTimeSeriesSource(dataSource: string): boolean {
  return isMultiSeriesSource(dataSource);
}
