import type { ChartType } from "@/lib/dashboard/chart-types";
import { CHART_TYPES } from "@/lib/dashboard/chart-types";

/** Fuentes persistidas en `DashboardWidget.dataSource`. */
export const ANALYTICS_DATA_SOURCES = [
  "tickets_by_status",
  "backlog_by_status",
  "tickets_by_operator",
  "tickets_by_priority",
  "tickets_by_municipio",
  "top_buses",
  "anomalous_buses",
  "shift_load_today",
  "shift_comparison",
  "tickets_by_hour",
  "mttr_by_priority",
  "top_tecnicos",
  "sla_compliance",
  "tickets_trend",
  "manual",
] as const;

export const KPI_DATA_SOURCES = [
  "kpi_open_tickets",
  "kpi_active_incidents",
  "kpi_sla_percent",
  "kpi_sla_vencidos",
  "kpi_alta_prioridad",
  "kpi_mttr",
  "kpi_fleet_availability",
  "kpi_unassigned",
  "kpi_resolved_30d",
  "kpi_created_today",
] as const;

export const EMBED_DATA_SOURCES = [
  "operation_links",
  "embed_tickets",
  "embed_preventive",
  "embed_desvios",
  "embed_health",
  "embed_handover",
  "embed_sla_urgent",
] as const;

export const ALL_DATA_SOURCES = [
  ...ANALYTICS_DATA_SOURCES,
  ...KPI_DATA_SOURCES,
  ...EMBED_DATA_SOURCES,
] as const;

export type AnalyticsDataSource = (typeof ANALYTICS_DATA_SOURCES)[number];
export type KpiDataSource = (typeof KPI_DATA_SOURCES)[number];
export type EmbedDataSource = (typeof EMBED_DATA_SOURCES)[number];
export type DashboardDataSource = (typeof ALL_DATA_SOURCES)[number];

export type DataSourceCategory = "kpi" | "tickets" | "sla" | "trend" | "operacion" | "embed" | "manual";

export type DataSourceMeta = {
  id: DashboardDataSource;
  label: string;
  description: string;
  category: DataSourceCategory;
  /** Tipos de gráfica permitidos; vacío = solo KPI card o embed sin gráfica. */
  compatibleCharts: readonly ChartType[];
  defaultChart: ChartType;
  defaultTitle: string;
  /** Si true, ignora el selector de días del dashboard (snapshot actual). */
  snapshot?: boolean;
};

const CATEGORICAL_CHARTS = [
  "bar",
  "bar_horizontal",
  "pie",
  "rose",
  "radar",
  "radialbar",
  "treemap",
  "funnel",
  "scatter",
  "bubble",
  "sankey",
] as const satisfies readonly ChartType[];

const TIME_SERIES_CHARTS = [
  "line",
  "area",
  "bar",
  "composed",
  "stacked_bar",
  "stacked_area",
] as const satisfies readonly ChartType[];

const KPI_ONLY = ["kpi"] as const satisfies readonly ChartType[];

export const DATA_SOURCE_REGISTRY: Record<DashboardDataSource, DataSourceMeta> = {
  kpi_open_tickets: {
    id: "kpi_open_tickets",
    label: "Tickets abiertos",
    description: "Incidencias en estado abierto ahora mismo.",
    category: "kpi",
    compatibleCharts: KPI_ONLY,
    defaultChart: "kpi",
    defaultTitle: "Tickets abiertos",
    snapshot: true,
  },
  kpi_sla_percent: {
    id: "kpi_sla_percent",
    label: "Cumplimiento SLA",
    description: "% de tickets resueltos en plazo (últimos 30 días).",
    category: "kpi",
    compatibleCharts: KPI_ONLY,
    defaultChart: "kpi",
    defaultTitle: "Cumplimiento SLA",
    snapshot: true,
  },
  kpi_mttr: {
    id: "kpi_mttr",
    label: "MTTR medio",
    description: "Tiempo medio de resolución (últimos 30 días).",
    category: "kpi",
    compatibleCharts: KPI_ONLY,
    defaultChart: "kpi",
    defaultTitle: "MTTR medio",
    snapshot: true,
  },
  kpi_fleet_availability: {
    id: "kpi_fleet_availability",
    label: "Disponibilidad flota",
    description: "% de buses sin ticket activo.",
    category: "kpi",
    compatibleCharts: KPI_ONLY,
    defaultChart: "kpi",
    defaultTitle: "Disponibilidad flota",
    snapshot: true,
  },
  kpi_unassigned: {
    id: "kpi_unassigned",
    label: "Sin asignar (+30 min)",
    description: "Tickets activos sin responsable y con más de 30 min.",
    category: "kpi",
    compatibleCharts: KPI_ONLY,
    defaultChart: "kpi",
    defaultTitle: "Sin asignar",
    snapshot: true,
  },
  kpi_resolved_30d: {
    id: "kpi_resolved_30d",
    label: "Resueltos (30 días)",
    description: "Tickets cerrados en los últimos 30 días.",
    category: "kpi",
    compatibleCharts: KPI_ONLY,
    defaultChart: "kpi",
    defaultTitle: "Resueltos 30d",
    snapshot: true,
  },
  kpi_created_today: {
    id: "kpi_created_today",
    label: "Creados hoy",
    description: "Tickets registrados en el día de hoy.",
    category: "kpi",
    compatibleCharts: KPI_ONLY,
    defaultChart: "kpi",
    defaultTitle: "Creados hoy",
    snapshot: true,
  },
  kpi_active_incidents: {
    id: "kpi_active_incidents",
    label: "Incidencias activas",
    description: "Tickets no resueltos (abierto + en proceso + esperando repuesto).",
    category: "kpi",
    compatibleCharts: KPI_ONLY,
    defaultChart: "kpi",
    defaultTitle: "Incidencias activas",
    snapshot: true,
  },
  kpi_sla_vencidos: {
    id: "kpi_sla_vencidos",
    label: "SLA vencidos",
    description: "Tickets activos con plazo SLA ya superado.",
    category: "kpi",
    compatibleCharts: KPI_ONLY,
    defaultChart: "kpi",
    defaultTitle: "SLA vencidos",
    snapshot: true,
  },
  kpi_alta_prioridad: {
    id: "kpi_alta_prioridad",
    label: "Prioridad alta",
    description: "Tickets activos con prioridad alta.",
    category: "kpi",
    compatibleCharts: KPI_ONLY,
    defaultChart: "kpi",
    defaultTitle: "Prioridad alta",
    snapshot: true,
  },
  tickets_by_status: {
    id: "tickets_by_status",
    label: "Tickets por estado (periodo)",
    description: "Conteo por estado de tickets creados en el rango seleccionado.",
    category: "tickets",
    compatibleCharts: CATEGORICAL_CHARTS,
    defaultChart: "bar",
    defaultTitle: "Tickets por estado",
  },
  backlog_by_status: {
    id: "backlog_by_status",
    label: "Backlog por estado",
    description: "Tickets activos agrupados por estado (snapshot actual).",
    category: "tickets",
    compatibleCharts: CATEGORICAL_CHARTS,
    defaultChart: "bar_horizontal",
    defaultTitle: "Backlog por estado",
    snapshot: true,
  },
  tickets_by_operator: {
    id: "tickets_by_operator",
    label: "Tickets por operadora",
    description: "Distribución por operadora en el periodo.",
    category: "tickets",
    compatibleCharts: CATEGORICAL_CHARTS,
    defaultChart: "bar_horizontal",
    defaultTitle: "Tickets por operadora",
  },
  tickets_by_priority: {
    id: "tickets_by_priority",
    label: "Tickets por prioridad",
    description: "Alta / media / baja en el periodo.",
    category: "tickets",
    compatibleCharts: CATEGORICAL_CHARTS,
    defaultChart: "pie",
    defaultTitle: "Tickets por prioridad",
  },
  tickets_by_municipio: {
    id: "tickets_by_municipio",
    label: "Incidencias por municipio",
    description: "Top municipios con tickets activos.",
    category: "tickets",
    compatibleCharts: CATEGORICAL_CHARTS,
    defaultChart: "bar_horizontal",
    defaultTitle: "Por municipio",
    snapshot: true,
  },
  top_buses: {
    id: "top_buses",
    label: "Top buses (incidencias)",
    description: "Buses con más tickets en el periodo.",
    category: "tickets",
    compatibleCharts: CATEGORICAL_CHARTS,
    defaultChart: "bar_horizontal",
    defaultTitle: "Top buses",
  },
  anomalous_buses: {
    id: "anomalous_buses",
    label: "Buses anómalos",
    description: "Buses con más incidencias en los últimos 30 días.",
    category: "tickets",
    compatibleCharts: CATEGORICAL_CHARTS,
    defaultChart: "bar_horizontal",
    defaultTitle: "Buses anómalos",
    snapshot: true,
  },
  shift_load_today: {
    id: "shift_load_today",
    label: "Carga por turno hoy",
    description: "Tickets creados hoy repartidos M / T / N.",
    category: "operacion",
    compatibleCharts: ["bar", "pie", "radialbar"],
    defaultChart: "bar",
    defaultTitle: "Carga por turno",
    snapshot: true,
  },
  shift_comparison: {
    id: "shift_comparison",
    label: "Comparativa de turnos",
    description: "Carga de ayer vs hoy por turno M/T/N.",
    category: "operacion",
    compatibleCharts: ["bar", "stacked_bar", "bar_horizontal"],
    defaultChart: "bar",
    defaultTitle: "Turnos ayer vs hoy",
    snapshot: true,
  },
  tickets_by_hour: {
    id: "tickets_by_hour",
    label: "Tickets por hora",
    description: "Distribución horaria de tickets creados en el periodo.",
    category: "tickets",
    compatibleCharts: ["bar", "area", "line"],
    defaultChart: "bar",
    defaultTitle: "Carga horaria",
  },
  mttr_by_priority: {
    id: "mttr_by_priority",
    label: "MTTR por prioridad",
    description: "Tiempo medio de resolución (min) por prioridad · 30 días.",
    category: "sla",
    compatibleCharts: CATEGORICAL_CHARTS,
    defaultChart: "bar_horizontal",
    defaultTitle: "MTTR por prioridad",
    snapshot: true,
  },
  top_tecnicos: {
    id: "top_tecnicos",
    label: "Top técnicos",
    description: "Tickets resueltos por técnico en los últimos 30 días.",
    category: "operacion",
    compatibleCharts: CATEGORICAL_CHARTS,
    defaultChart: "bar_horizontal",
    defaultTitle: "Top técnicos",
    snapshot: true,
  },
  sla_compliance: {
    id: "sla_compliance",
    label: "Cumplimiento SLA diario",
    description: "Resueltos en plazo vs fuera de plazo por día.",
    category: "sla",
    compatibleCharts: TIME_SERIES_CHARTS,
    defaultChart: "stacked_bar",
    defaultTitle: "SLA diario",
  },
  tickets_trend: {
    id: "tickets_trend",
    label: "Tendencia creados / resueltos",
    description: "Evolución diaria de entradas y cierres.",
    category: "trend",
    compatibleCharts: TIME_SERIES_CHARTS,
    defaultChart: "composed",
    defaultTitle: "Tendencia tickets",
  },
  manual: {
    id: "manual",
    label: "Datos manuales",
    description: "Serie personalizada en JSON.",
    category: "manual",
    compatibleCharts: CHART_TYPES.filter((t) => t !== "kpi"),
    defaultChart: "bar",
    defaultTitle: "Datos manuales",
  },
  operation_links: {
    id: "operation_links",
    label: "Enlaces de operación",
    description: "Accesos rápidos a pantallas habituales.",
    category: "embed",
    compatibleCharts: [],
    defaultChart: "bar",
    defaultTitle: "Enlaces",
    snapshot: true,
  },
  embed_tickets: {
    id: "embed_tickets",
    label: "Bandeja de tickets",
    description: "Listado compacto de incidencias activas.",
    category: "embed",
    compatibleCharts: [],
    defaultChart: "bar",
    defaultTitle: "Bandeja",
    snapshot: true,
  },
  embed_preventive: {
    id: "embed_preventive",
    label: "Agenda preventiva",
    description: "Resumen de tareas preventivas.",
    category: "embed",
    compatibleCharts: [],
    defaultChart: "bar",
    defaultTitle: "Preventivo",
    snapshot: true,
  },
  embed_desvios: {
    id: "embed_desvios",
    label: "Desvíos activos",
    description: "Listado compacto de desvíos en curso.",
    category: "embed",
    compatibleCharts: [],
    defaultChart: "bar",
    defaultTitle: "Desvíos",
    snapshot: true,
  },
  embed_health: {
    id: "embed_health",
    label: "Salud operativa",
    description: "Poller, desvíos y tickets críticos.",
    category: "embed",
    compatibleCharts: [],
    defaultChart: "bar",
    defaultTitle: "Salud ops",
    snapshot: true,
  },
  embed_handover: {
    id: "embed_handover",
    label: "Pases de turno",
    description: "Últimos handovers M/T/N.",
    category: "embed",
    compatibleCharts: [],
    defaultChart: "bar",
    defaultTitle: "Pase de turno",
    snapshot: true,
  },
  embed_sla_urgent: {
    id: "embed_sla_urgent",
    label: "Urgentes por SLA",
    description: "Tickets activos ordenados por proximidad al vencimiento SLA.",
    category: "embed",
    compatibleCharts: [],
    defaultChart: "bar",
    defaultTitle: "Urgentes SLA",
    snapshot: true,
  },
};

export function getDataSourceMeta(id: string): DataSourceMeta | null {
  return DATA_SOURCE_REGISTRY[id as DashboardDataSource] ?? null;
}

export function getDataSourceLabel(id: string): string {
  return getDataSourceMeta(id)?.label ?? "Fuente personalizada";
}

export function isKpiDataSource(id: string): boolean {
  return (KPI_DATA_SOURCES as readonly string[]).includes(id);
}

export function isEmbedDataSource(id: string): boolean {
  return (EMBED_DATA_SOURCES as readonly string[]).includes(id);
}

export function getCompatibleCharts(dataSource: string): readonly ChartType[] {
  const meta = getDataSourceMeta(dataSource);
  if (!meta) return CHART_TYPES.filter((t) => t !== "kpi");
  if (meta.compatibleCharts.length === 0) return [];
  return meta.compatibleCharts;
}

export function isChartCompatible(dataSource: string, chartType: ChartType): boolean {
  const allowed = getCompatibleCharts(dataSource);
  if (allowed.length === 0) return false;
  return allowed.includes(chartType);
}

export function pickDefaultChart(dataSource: string): ChartType {
  return getDataSourceMeta(dataSource)?.defaultChart ?? "bar";
}

export const DATA_SOURCE_GROUPS: { title: string; sources: DashboardDataSource[] }[] = [
  {
    title: "KPIs operativos",
    sources: [...KPI_DATA_SOURCES],
  },
  {
    title: "Alertas y SLA",
    sources: ["kpi_sla_vencidos", "kpi_alta_prioridad", "sla_compliance", "mttr_by_priority", "embed_sla_urgent"],
  },
  {
    title: "Tickets e incidencias",
    sources: [
      "backlog_by_status",
      "tickets_by_status",
      "tickets_by_priority",
      "tickets_by_operator",
      "tickets_by_municipio",
      "top_buses",
      "anomalous_buses",
      "tickets_by_hour",
      "shift_load_today",
      "top_tecnicos",
    ],
  },
  {
    title: "Comparativa de turnos",
    sources: ["shift_comparison"],
  },
  {
    title: "Tendencias",
    sources: ["tickets_trend"],
  },
  {
    title: "Vistas embebidas",
    sources: [...EMBED_DATA_SOURCES],
  },
  {
    title: "Otros",
    sources: ["manual", "operation_links"],
  },
];
