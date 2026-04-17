"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { ccmgcNativeSelectClassName, Textarea } from "@/components/ui/input";
import type { MetricFormat } from "@/lib/dashboard/chart-theme";
import type { ChartType } from "@/lib/dashboard/chart-types";
import { cn } from "@/lib/utils";

type AddWidgetModalProps = {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  userId: string | null;
  onAdd: (widget: {
    title: string;
    chartType: string;
    dataSource: string;
    size: string;
    config: string;
  }) => void;
};

type VisualPreset = "operaciones" | "sla" | "inventario";
type PersistedVisualSettings = {
  accentColor: string;
  showLegend: boolean;
  showGrid: boolean;
  smoothLines: boolean;
  metricFormat: MetricFormat;
};

function getDefaultSeriesLabels(dataSource: string) {
  if (dataSource === "sla_compliance") {
    return {
      serieA: "Cumplido",
      serieB: "Incumplido",
      serieC: "Buffer",
    };
  }
  return {
    serieA: "Principal",
    serieB: "Secundaria",
    serieC: "Auxiliar",
  };
}

function getVisualSettingsStorageKey(dashboardId: string, userId: string | null) {
  return `dashboard-widget-visual:${userId ?? "anon"}:${dashboardId}`;
}

export function AddWidgetModal({ open, onClose, onAdd, dashboardId, userId }: AddWidgetModalProps) {
  const [title, setTitle] = useState("");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [dataSource, setDataSource] = useState("tickets_by_status");
  const [size, setSize] = useState<"small" | "medium" | "large">("medium");
  const [manualData, setManualData] = useState('[{"name":"Enero","value":12},{"name":"Febrero","value":8}]');
  const [accentColor, setAccentColor] = useState("#2563EB");
  const [showLegend, setShowLegend] = useState(true);
  const [seriesLabelA, setSeriesLabelA] = useState("Principal");
  const [seriesLabelB, setSeriesLabelB] = useState("Secundaria");
  const [seriesLabelC, setSeriesLabelC] = useState("Auxiliar");
  const [lockSeriesLabels, setLockSeriesLabels] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [smoothLines, setSmoothLines] = useState(true);
  const [metricFormat, setMetricFormat] = useState<MetricFormat>("number");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAdvancedOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      const key = getVisualSettingsStorageKey(dashboardId, userId);
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedVisualSettings;
      if (parsed.accentColor) setAccentColor(parsed.accentColor);
      setShowLegend(Boolean(parsed.showLegend));
      setShowGrid(Boolean(parsed.showGrid));
      setSmoothLines(Boolean(parsed.smoothLines));
      setMetricFormat(parsed.metricFormat ?? "number");
    } catch {
      // ignore invalid persisted values
    }
  }, [open, dashboardId, userId]);

  useEffect(() => {
    if (chartType !== "stacked_bar" && chartType !== "stacked_area") return;
    if (lockSeriesLabels) return;
    const defaults = getDefaultSeriesLabels(dataSource);
    setSeriesLabelA(defaults.serieA);
    setSeriesLabelB(defaults.serieB);
    setSeriesLabelC(defaults.serieC);
  }, [chartType, dataSource, lockSeriesLabels]);

  if (!open) {
    return null;
  }

  const applyVisualPreset = (preset: VisualPreset) => {
    let next: PersistedVisualSettings;
    if (preset === "operaciones") {
      next = {
        accentColor: "#2563EB",
        showLegend: true,
        showGrid: true,
        smoothLines: true,
        metricFormat: "number",
      };
    } else if (preset === "sla") {
      next = {
        accentColor: "#059669",
        showLegend: true,
        showGrid: true,
        smoothLines: true,
        metricFormat: "percent",
      };
    } else {
      next = {
        accentColor: "#D97706",
        showLegend: true,
        showGrid: true,
        smoothLines: false,
        metricFormat: "integer",
      };
    }
    setAccentColor(next.accentColor);
    setShowLegend(next.showLegend);
    setShowGrid(next.showGrid);
    setSmoothLines(next.smoothLines);
    setMetricFormat(next.metricFormat);
    try {
      const key = getVisualSettingsStorageKey(dashboardId, userId);
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore persistence errors
    }
  };

  const handleAdd = () => {
    const safeTitle = title.trim();
    if (safeTitle.length < 2) {
      setError("El título debe tener al menos 2 caracteres");
      return;
    }

    let config: string;
    if (dataSource === "manual") {
      try {
        const parsed = JSON.parse(manualData) as { name: string; value: number }[];
        const defaults = getDefaultSeriesLabels(dataSource);
        config = JSON.stringify({
          accentColor,
          manualData: parsed,
          showLegend,
          showGrid,
          smoothLines,
          metricFormat,
          seriesLabels: {
            serieA: seriesLabelA.trim() || defaults.serieA,
            serieB: seriesLabelB.trim() || defaults.serieB,
            serieC: seriesLabelC.trim() || defaults.serieC,
          },
          lockSeriesLabels,
        });
      } catch {
        setError("El JSON de datos no es válido");
        return;
      }
    } else {
      const defaults = getDefaultSeriesLabels(dataSource);
      config = JSON.stringify({
        accentColor,
        showLegend,
        showGrid,
        smoothLines,
        metricFormat,
        seriesLabels: {
          serieA: seriesLabelA.trim() || defaults.serieA,
          serieB: seriesLabelB.trim() || defaults.serieB,
          serieC: seriesLabelC.trim() || defaults.serieC,
        },
        lockSeriesLabels,
      });
    }

    try {
      const key = getVisualSettingsStorageKey(dashboardId, userId);
      const persist: PersistedVisualSettings = { accentColor, showLegend, showGrid, smoothLines, metricFormat };
      window.localStorage.setItem(key, JSON.stringify(persist));
    } catch {
      // ignore persistence errors
    }

    onAdd({
      title: safeTitle,
      chartType,
      dataSource,
      size,
      config,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-border)] p-6 w-full max-w-md max-h-[85vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-subheading">Añadir widget</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-[var(--color-surface-3)] transition-all"
          >
            <X size={14} />
          </button>
        </div>

        <div
          className="space-y-3 overflow-y-auto pr-1 max-h-[calc(85vh-140px)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0"
        >
          <div>
            <label className="text-label block mb-1.5">Título del widget</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del widget"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all"
            />
          </div>

          <div>
            <label className="text-label block mb-1.5">Tipo de gráfica</label>
            <select
              id="chart-type"
              value={chartType}
              onChange={(e) => setChartType(e.target.value as ChartType)}
              className="sr-only"
            >
              <option value="area">Área</option>
              <option value="bar">Barras</option>
              <option value="stacked_bar">Barras apiladas</option>
              <option value="bar_horizontal">Barras horizontales</option>
              <option value="pie">Circular (donut)</option>
              <option value="rose">Rosa (polar)</option>
              <option value="line">Líneas</option>
              <option value="stacked_area">Área apilada</option>
              <option value="composed">Compuesta (barras + línea)</option>
              <option value="radar">Radar</option>
              <option value="radialbar">Barras radiales</option>
              <option value="scatter">Dispersión</option>
              <option value="bubble">Burbujas</option>
              <option value="treemap">Treemap</option>
              <option value="sankey">Sankey (flujo)</option>
              <option value="funnel">Embudo</option>
            </select>

            <div className="grid grid-cols-5 gap-1.5 mt-2 max-h-56 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0">
              {[
                { value: "bar", label: "Barras", icon: "▊▊▊" },
                { value: "stacked_bar", label: "Stack B", icon: "▇▅▃" },
                { value: "bar_horizontal", label: "H.Bar", icon: "≡≡" },
                { value: "line", label: "Línea", icon: "∿∿" },
                { value: "stacked_area", label: "Stack A", icon: "◨◧" },
                { value: "area", label: "Área", icon: "◭◭" },
                { value: "pie", label: "Donut", icon: "◎" },
                { value: "rose", label: "Rose", icon: "✿" },
                { value: "composed", label: "Mix", icon: "▊∿" },
                { value: "radar", label: "Radar", icon: "⬡" },
                { value: "radialbar", label: "Radial", icon: "◉" },
                { value: "scatter", label: "Puntos", icon: "∴∵" },
                { value: "bubble", label: "Bubble", icon: "◌◍" },
                { value: "treemap", label: "Tree", icon: "▦" },
                { value: "sankey", label: "Flujo", icon: "⇉" },
                { value: "funnel", label: "Embudo", icon: "▽" },
              ].map(({ value, label, icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setChartType(value as ChartType)}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-all",
                    chartType === value
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-3)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-2)]",
                  )}
                >
                  <span className="text-base leading-none mb-1">{icon}</span>
                  <span className="text-[10px] leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-label block mb-1.5">Fuente de datos</label>
            <select
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              className={cn(ccmgcNativeSelectClassName, "focus:ring-2 focus:ring-[var(--color-accent)]")}
            >
              <option value="tickets_by_status">Tickets por estado</option>
              <option value="tickets_by_operator">Tickets por operadora</option>
              <option value="tickets_by_priority">Tickets por prioridad</option>
              <option value="sla_compliance">Cumplimiento SLA (7 días)</option>
              <option value="manual">Datos manuales</option>
            </select>
          </div>

          {dataSource === "manual" ? (
            <Textarea
              label="Datos (JSON)"
              value={manualData}
              onChange={(e) => setManualData(e.target.value)}
              placeholder='[{"name":"Enero","value":12},{"name":"Febrero","value":8}]'
              className="min-h-[96px]"
            />
          ) : null}

          <div>
            <label className="text-label block mb-1.5">Color de acento</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { color: "#2563EB", label: "Azul" },
                { color: "#059669", label: "Verde" },
                { color: "#D97706", label: "Ámbar" },
                { color: "#DC2626", label: "Rojo" },
                { color: "#7C3AED", label: "Morado" },
                { color: "#0891B2", label: "Cian" },
                { color: "#DB2777", label: "Rosa" },
                { color: "#65A30D", label: "Lima" },
              ].map(({ color, label }) => (
                <button
                  key={color}
                  type="button"
                  title={label}
                  onClick={() => setAccentColor(color)}
                  className={cn(
                    "w-7 h-7 rounded-full border-2 transition-all",
                    accentColor === color
                      ? "border-white scale-110"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="pt-1">
            <label className="text-label block mb-1.5">Leyenda</label>
            <button
              type="button"
              onClick={() => setShowLegend((v) => !v)}
              className={cn(
                "w-full rounded-lg border px-3 py-2.5 text-sm transition-all flex items-center justify-between",
                showLegend
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-2)]",
              )}
            >
              <span>Mostrar nombres en la leyenda</span>
              <span className="font-semibold">{showLegend ? "ON" : "OFF"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)] transition-all flex items-center justify-between"
            >
              <span>Opciones avanzadas</span>
              <span className="font-semibold">{advancedOpen ? "−" : "+"}</span>
            </button>
            {advancedOpen ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => applyVisualPreset("operaciones")}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)] transition-all"
                  >
                    Ops
                  </button>
                  <button
                    type="button"
                    onClick={() => applyVisualPreset("sla")}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)] transition-all"
                  >
                    SLA
                  </button>
                  <button
                    type="button"
                    onClick={() => applyVisualPreset("inventario")}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)] transition-all"
                  >
                    Inventario
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGrid((v) => !v)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm transition-all flex items-center justify-between",
                    showGrid
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-2)]",
                  )}
                >
                  <span>Mostrar rejilla (grid)</span>
                  <span className="font-semibold">{showGrid ? "ON" : "OFF"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSmoothLines((v) => !v)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm transition-all flex items-center justify-between",
                    smoothLines
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-2)]",
                  )}
                >
                  <span>Suavizado de línea</span>
                  <span className="font-semibold">{smoothLines ? "ON" : "OFF"}</span>
                </button>
                <select
                  value={metricFormat}
                  onChange={(e) => setMetricFormat(e.target.value as MetricFormat)}
                  className={cn(ccmgcNativeSelectClassName, "py-2 focus:ring-2 focus:ring-[var(--color-accent)]")}
                >
                  <option value="number">Formato: Número</option>
                  <option value="compact">Formato: Compacto (k, M)</option>
                  <option value="integer">Formato: Entero</option>
                  <option value="percent">Formato: Porcentaje</option>
                </select>
              </>
            ) : null}
          </div>

          {chartType === "stacked_bar" || chartType === "stacked_area" ? (
            <div className="grid grid-cols-1 gap-2">
              <label className="text-label">Nombres de series (apiladas)</label>
              <button
                type="button"
                onClick={() => setLockSeriesLabels((v) => !v)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-sm transition-all flex items-center justify-between",
                  lockSeriesLabels
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-2)]",
                )}
              >
                <span>Mantener nombres personalizados</span>
                <span className="font-semibold">{lockSeriesLabels ? "ON" : "OFF"}</span>
              </button>
              <input
                value={seriesLabelA}
                onChange={(e) => setSeriesLabelA(e.target.value)}
                placeholder="Principal"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all"
              />
              <input
                value={seriesLabelB}
                onChange={(e) => setSeriesLabelB(e.target.value)}
                placeholder="Secundaria"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all"
              />
              <input
                value={seriesLabelC}
                onChange={(e) => setSeriesLabelC(e.target.value)}
                placeholder="Auxiliar"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all"
              />
            </div>
          ) : null}

          <div>
            <label className="text-label block mb-1.5">Tamaño</label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as "small" | "medium" | "large")}
              className={cn(ccmgcNativeSelectClassName, "focus:ring-2 focus:ring-[var(--color-accent)]")}
            >
              <option value="small">Pequeño (1/4)</option>
              <option value="medium">Mediano (1/2)</option>
              <option value="large">Grande (completo)</option>
            </select>
          </div>

          {error ? <p className="text-xs text-[var(--color-error)]">{error}</p> : null}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)] transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleAdd}
            className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-all"
          >
            Añadir widget
          </button>
        </div>
      </div>
    </div>
  );
}
