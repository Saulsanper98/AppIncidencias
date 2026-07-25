import type { MetricFormat } from "@/lib/dashboard/chart-theme";

export type BuiltinVisualPreset = {
  id: string;
  name: string;
  description: string;
  accentColor: string;
  showLegend: boolean;
  showGrid: boolean;
  smoothLines: boolean;
  metricFormat: MetricFormat;
};

/** Presets visuales de un clic — se aplican a todos los widgets del panel. */
export const BUILTIN_VISUAL_PRESETS: BuiltinVisualPreset[] = [
  {
    id: "ops-blue",
    name: "Operaciones",
    description: "Azul CCMGC · rejilla y leyenda",
    accentColor: "#2563EB",
    showLegend: true,
    showGrid: true,
    smoothLines: true,
    metricFormat: "integer",
  },
  {
    id: "sla-green",
    name: "SLA",
    description: "Verde · porcentajes",
    accentColor: "#059669",
    showLegend: true,
    showGrid: true,
    smoothLines: true,
    metricFormat: "percent",
  },
  {
    id: "alert-amber",
    name: "Alertas",
    description: "Ámbar · foco en picos",
    accentColor: "#D97706",
    showLegend: true,
    showGrid: false,
    smoothLines: false,
    metricFormat: "integer",
  },
  {
    id: "executive-purple",
    name: "Ejecutivo",
    description: "Morado · líneas suaves",
    accentColor: "#7C3AED",
    showLegend: false,
    showGrid: false,
    smoothLines: true,
    metricFormat: "compact",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Sin rejilla ni leyenda",
    accentColor: "#64748B",
    showLegend: false,
    showGrid: false,
    smoothLines: true,
    metricFormat: "number",
  },
  {
    id: "contrast-red",
    name: "Criticidad",
    description: "Rojo · enteros",
    accentColor: "#DC2626",
    showLegend: true,
    showGrid: true,
    smoothLines: false,
    metricFormat: "integer",
  },
];
