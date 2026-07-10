import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Clock,
  LayoutDashboard,
  ShieldCheck,
  Sun,
  Target,
  Truck,
} from "lucide-react";

import type { ChartType } from "@/lib/dashboard/chart-types";

export type DashboardTemplateWidget = {
  title: string;
  chartType: ChartType;
  dataSource: string;
  size: "small" | "medium" | "large";
  config?: Record<string, unknown>;
};

export type DashboardTemplate = {
  id: string;
  name: string;
  description: string;
  accentColor: string;
  icon: LucideIcon;
  widgets: DashboardTemplateWidget[];
};

const kpiRowLayout = (colSpan: number) => ({ layout: { colSpan, minHeightPx: 160 } });

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: "operaciones",
    name: "Operaciones CCMGC",
    description: "KPIs clave, tendencia y bandeja compacta para el centro de control.",
    accentColor: "#2563EB",
    icon: LayoutDashboard,
    widgets: [
      {
        title: "Tickets abiertos",
        chartType: "kpi",
        dataSource: "kpi_open_tickets",
        size: "small",
        config: { accentColor: "#2563EB", ...kpiRowLayout(25) },
      },
      {
        title: "Cumplimiento SLA",
        chartType: "kpi",
        dataSource: "kpi_sla_percent",
        size: "small",
        config: { accentColor: "#059669", ...kpiRowLayout(25) },
      },
      {
        title: "MTTR medio",
        chartType: "kpi",
        dataSource: "kpi_mttr",
        size: "small",
        config: { accentColor: "#7C3AED", ...kpiRowLayout(25) },
      },
      {
        title: "Sin asignar",
        chartType: "kpi",
        dataSource: "kpi_unassigned",
        size: "small",
        config: { accentColor: "#D97706", ...kpiRowLayout(25) },
      },
      {
        title: "Tendencia entradas / cierres",
        chartType: "composed",
        dataSource: "tickets_trend",
        size: "large",
        config: {
          accentColor: "#2563EB",
          showLegend: true,
          showGrid: true,
          smoothLines: true,
          metricFormat: "integer",
          seriesLabels: { serieA: "Creados", serieB: "Resueltos", serieC: "—" },
          layout: { colSpan: 66, minHeightPx: 360 },
        },
      },
      {
        title: "Backlog por estado",
        chartType: "bar_horizontal",
        dataSource: "backlog_by_status",
        size: "medium",
        config: { accentColor: "#D97706", layout: { colSpan: 34, minHeightPx: 360 } },
      },
      {
        title: "Bandeja activa",
        chartType: "bar",
        dataSource: "embed_tickets",
        size: "large",
        config: { layout: { colSpan: 100, minHeightPx: 520 } },
      },
    ],
  },
  {
    id: "sla-semanal",
    name: "SLA semanal",
    description: "Cumplimiento, resolución y distribución por prioridad y operadora.",
    accentColor: "#059669",
    icon: ShieldCheck,
    widgets: [
      {
        title: "SLA 30 días",
        chartType: "kpi",
        dataSource: "kpi_sla_percent",
        size: "small",
        config: { accentColor: "#059669", ...kpiRowLayout(33) },
      },
      {
        title: "Resueltos 30d",
        chartType: "kpi",
        dataSource: "kpi_resolved_30d",
        size: "small",
        config: { accentColor: "#2563EB", ...kpiRowLayout(33) },
      },
      {
        title: "MTTR",
        chartType: "kpi",
        dataSource: "kpi_mttr",
        size: "small",
        config: { accentColor: "#7C3AED", ...kpiRowLayout(34) },
      },
      {
        title: "Cumplimiento diario",
        chartType: "stacked_bar",
        dataSource: "sla_compliance",
        size: "large",
        config: {
          accentColor: "#059669",
          seriesLabels: { serieA: "En plazo", serieB: "Fuera de plazo", serieC: "—" },
          layout: { colSpan: 100, minHeightPx: 380 },
        },
      },
      {
        title: "Prioridad en periodo",
        chartType: "pie",
        dataSource: "tickets_by_priority",
        size: "medium",
        config: { accentColor: "#DC2626", layout: { colSpan: 50, minHeightPx: 320 } },
      },
      {
        title: "Por operadora",
        chartType: "bar_horizontal",
        dataSource: "tickets_by_operator",
        size: "medium",
        config: { accentColor: "#2563EB", layout: { colSpan: 50, minHeightPx: 320 } },
      },
    ],
  },
  {
    id: "flota",
    name: "Flota y municipios",
    description: "Disponibilidad, top buses y carga por turno.",
    accentColor: "#0891B2",
    icon: Truck,
    widgets: [
      {
        title: "Disponibilidad flota",
        chartType: "kpi",
        dataSource: "kpi_fleet_availability",
        size: "small",
        config: { accentColor: "#0891B2", ...kpiRowLayout(50) },
      },
      {
        title: "Creados hoy",
        chartType: "kpi",
        dataSource: "kpi_created_today",
        size: "small",
        config: { accentColor: "#2563EB", ...kpiRowLayout(50) },
      },
      {
        title: "Top buses",
        chartType: "bar_horizontal",
        dataSource: "top_buses",
        size: "medium",
        config: { accentColor: "#7C3AED", layout: { colSpan: 50, minHeightPx: 340 } },
      },
      {
        title: "Por municipio (activos)",
        chartType: "treemap",
        dataSource: "tickets_by_municipio",
        size: "medium",
        config: { accentColor: "#0891B2", layout: { colSpan: 50, minHeightPx: 340 } },
      },
      {
        title: "Carga por turno hoy",
        chartType: "radialbar",
        dataSource: "shift_load_today",
        size: "medium",
        config: { accentColor: "#D97706", layout: { colSpan: 100, minHeightPx: 300 } },
      },
    ],
  },
  {
    id: "turno-actual",
    name: "Turno actual",
    description: "Lo que pasa hoy: carga M/T/N, backlog y bandeja en un vistazo.",
    accentColor: "#D97706",
    icon: Sun,
    widgets: [
      {
        title: "Creados hoy",
        chartType: "kpi",
        dataSource: "kpi_created_today",
        size: "small",
        config: { accentColor: "#2563EB", ...kpiRowLayout(33) },
      },
      {
        title: "Abiertos",
        chartType: "kpi",
        dataSource: "kpi_open_tickets",
        size: "small",
        config: { accentColor: "#DC2626", ...kpiRowLayout(33) },
      },
      {
        title: "Sin asignar",
        chartType: "kpi",
        dataSource: "kpi_unassigned",
        size: "small",
        config: { accentColor: "#D97706", ...kpiRowLayout(34) },
      },
      {
        title: "Carga por turno",
        chartType: "bar",
        dataSource: "shift_load_today",
        size: "medium",
        config: { accentColor: "#D97706", layout: { colSpan: 40, minHeightPx: 300 } },
      },
      {
        title: "Backlog",
        chartType: "pie",
        dataSource: "backlog_by_status",
        size: "medium",
        config: { accentColor: "#7C3AED", layout: { colSpan: 60, minHeightPx: 300 } },
      },
      {
        title: "Bandeja",
        chartType: "bar",
        dataSource: "embed_tickets",
        size: "large",
        config: { layout: { colSpan: 100, minHeightPx: 480 } },
      },
    ],
  },
  {
    id: "ejecutivo",
    name: "Vista ejecutiva",
    description: "Solo lo esencial: KPIs grandes y tendencia limpia para reuniones.",
    accentColor: "#7C3AED",
    icon: Target,
    widgets: [
      {
        title: "SLA",
        chartType: "kpi",
        dataSource: "kpi_sla_percent",
        size: "small",
        config: { accentColor: "#059669", ...kpiRowLayout(20) },
      },
      {
        title: "MTTR",
        chartType: "kpi",
        dataSource: "kpi_mttr",
        size: "small",
        config: { accentColor: "#7C3AED", ...kpiRowLayout(20) },
      },
      {
        title: "Flota",
        chartType: "kpi",
        dataSource: "kpi_fleet_availability",
        size: "small",
        config: { accentColor: "#0891B2", ...kpiRowLayout(20) },
      },
      {
        title: "Resueltos",
        chartType: "kpi",
        dataSource: "kpi_resolved_30d",
        size: "small",
        config: { accentColor: "#2563EB", ...kpiRowLayout(20) },
      },
      {
        title: "Abiertos",
        chartType: "kpi",
        dataSource: "kpi_open_tickets",
        size: "small",
        config: { accentColor: "#DC2626", ...kpiRowLayout(20) },
      },
      {
        title: "Tendencia",
        chartType: "area",
        dataSource: "tickets_trend",
        size: "large",
        config: {
          accentColor: "#7C3AED",
          showLegend: false,
          showGrid: false,
          smoothLines: true,
          layout: { colSpan: 100, minHeightPx: 340 },
        },
      },
    ],
  },
  {
    id: "analisis-tickets",
    name: "Análisis de tickets",
    description: "Distribuciones, rankings y enlaces rápidos de operación.",
    accentColor: "#2563EB",
    icon: BarChart3,
    widgets: [
      {
        title: "Por prioridad",
        chartType: "rose",
        dataSource: "tickets_by_priority",
        size: "medium",
        config: { accentColor: "#DC2626", layout: { colSpan: 33, minHeightPx: 320 } },
      },
      {
        title: "Por operadora",
        chartType: "bar_horizontal",
        dataSource: "tickets_by_operator",
        size: "medium",
        config: { accentColor: "#2563EB", layout: { colSpan: 67, minHeightPx: 320 } },
      },
      {
        title: "Estado en periodo",
        chartType: "funnel",
        dataSource: "tickets_by_status",
        size: "medium",
        config: { accentColor: "#D97706", layout: { colSpan: 50, minHeightPx: 320 } },
      },
      {
        title: "Top buses",
        chartType: "treemap",
        dataSource: "top_buses",
        size: "medium",
        config: { accentColor: "#7C3AED", layout: { colSpan: 50, minHeightPx: 320 } },
      },
      {
        title: "Accesos rápidos",
        chartType: "bar",
        dataSource: "operation_links",
        size: "medium",
        config: { layout: { colSpan: 100, minHeightPx: 280 } },
      },
    ],
  },
  {
    id: "monitor-continuo",
    name: "Monitor continuo",
    description: "Ideal en pantalla grande: KPIs + tendencia + SLA + bandeja.",
    accentColor: "#0891B2",
    icon: Activity,
    widgets: [
      {
        title: "Abiertos",
        chartType: "kpi",
        dataSource: "kpi_open_tickets",
        size: "small",
        config: { accentColor: "#DC2626", ...kpiRowLayout(25) },
      },
      {
        title: "SLA",
        chartType: "kpi",
        dataSource: "kpi_sla_percent",
        size: "small",
        config: { accentColor: "#059669", ...kpiRowLayout(25) },
      },
      {
        title: "Sin asignar",
        chartType: "kpi",
        dataSource: "kpi_unassigned",
        size: "small",
        config: { accentColor: "#D97706", ...kpiRowLayout(25) },
      },
      {
        title: "Hoy",
        chartType: "kpi",
        dataSource: "kpi_created_today",
        size: "small",
        config: { accentColor: "#2563EB", ...kpiRowLayout(25) },
      },
      {
        title: "Tendencia",
        chartType: "line",
        dataSource: "tickets_trend",
        size: "large",
        config: { accentColor: "#0891B2", layout: { colSpan: 60, minHeightPx: 360 } },
      },
      {
        title: "SLA diario",
        chartType: "stacked_area",
        dataSource: "sla_compliance",
        size: "large",
        config: {
          accentColor: "#059669",
          seriesLabels: { serieA: "En plazo", serieB: "Fuera de plazo", serieC: "—" },
          layout: { colSpan: 40, minHeightPx: 360 },
        },
      },
      {
        title: "Bandeja en vivo",
        chartType: "bar",
        dataSource: "embed_tickets",
        size: "large",
        config: { layout: { colSpan: 100, minHeightPx: 500 } },
      },
    ],
  },
  {
    id: "preventivo-lite",
    name: "Preventivo + operación",
    description: "Agenda preventiva junto a KPIs y municipios activos.",
    accentColor: "#65A30D",
    icon: Clock,
    widgets: [
      {
        title: "Disponibilidad",
        chartType: "kpi",
        dataSource: "kpi_fleet_availability",
        size: "small",
        config: { accentColor: "#65A30D", ...kpiRowLayout(33) },
      },
      {
        title: "Abiertos",
        chartType: "kpi",
        dataSource: "kpi_open_tickets",
        size: "small",
        config: { accentColor: "#DC2626", ...kpiRowLayout(33) },
      },
      {
        title: "MTTR",
        chartType: "kpi",
        dataSource: "kpi_mttr",
        size: "small",
        config: { accentColor: "#7C3AED", ...kpiRowLayout(34) },
      },
      {
        title: "Municipios activos",
        chartType: "bar_horizontal",
        dataSource: "tickets_by_municipio",
        size: "medium",
        config: { accentColor: "#0891B2", layout: { colSpan: 50, minHeightPx: 340 } },
      },
      {
        title: "Agenda preventiva",
        chartType: "bar",
        dataSource: "embed_preventive",
        size: "large",
        config: { layout: { colSpan: 50, minHeightPx: 340 } },
      },
    ],
  },
];
