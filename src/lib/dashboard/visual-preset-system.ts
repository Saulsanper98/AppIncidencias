import type { MetricFormat } from "@/lib/dashboard/chart-theme";

/** Ajustes visuales compartidos entre modal, panel y presets guardados. */
export type VisualPresetSettings = {
  accentColor: string;
  showLegend: boolean;
  showGrid: boolean;
  smoothLines: boolean;
  metricFormat: MetricFormat;
};

export type BuiltinVisualPreset = VisualPresetSettings & {
  id: string;
  name: string;
  description: string;
};

export type SavedVisualPreset = {
  id: string;
  name: string;
  favorite: boolean;
  settings: VisualPresetSettings;
};

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

export function getLastVisualSettingsKey(dashboardId: string, userId: string | null) {
  return `dashboard-widget-visual:${userId ?? "anon"}:${dashboardId}`;
}

export function getSavedPresetsKey(dashboardId: string, userId: string | null) {
  return `dashboard-presets:${userId ?? "anon"}:${dashboardId}`;
}

export function settingsFromBuiltin(presetId: string): VisualPresetSettings | null {
  const preset = BUILTIN_VISUAL_PRESETS.find((item) => item.id === presetId);
  if (!preset) return null;
  const { id: _id, name: _name, description: _description, ...settings } = preset;
  return settings;
}

export function loadLastVisualSettings(dashboardId: string, userId: string | null): VisualPresetSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getLastVisualSettingsKey(dashboardId, userId));
    if (!raw) return null;
    return JSON.parse(raw) as VisualPresetSettings;
  } catch {
    return null;
  }
}

export function saveLastVisualSettings(
  dashboardId: string,
  userId: string | null,
  settings: VisualPresetSettings,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getLastVisualSettingsKey(dashboardId, userId), JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function loadSavedPresets(dashboardId: string, userId: string | null): SavedVisualPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getSavedPresetsKey(dashboardId, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedVisualPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSavedPresets(dashboardId: string, userId: string | null, presets: SavedVisualPreset[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getSavedPresetsKey(dashboardId, userId), JSON.stringify(presets));
  } catch {
    /* ignore */
  }
}

export function collectVisualSettings(input: {
  accentColor: string;
  showLegend: boolean;
  showGrid: boolean;
  smoothLines: boolean;
  metricFormat: MetricFormat;
}): VisualPresetSettings {
  return {
    accentColor: input.accentColor,
    showLegend: input.showLegend,
    showGrid: input.showGrid,
    smoothLines: input.smoothLines,
    metricFormat: input.metricFormat,
  };
}
