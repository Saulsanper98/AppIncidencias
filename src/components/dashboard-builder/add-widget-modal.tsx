"use client";

import { useEffect, useState } from "react";

import { ModalShell } from "@/components/ui/modal-shell";
import { Select, Textarea } from "@/components/ui/input";
import type { MetricFormat } from "@/lib/dashboard/chart-theme";
import type { ChartType } from "@/lib/dashboard/chart-types";
import {
  DATA_SOURCE_GROUPS,
  getCompatibleCharts,
  getDataSourceMeta,
  isEmbedDataSource,
  pickDefaultChart,
} from "@/lib/dashboard/data-sources";
import { CHART_TYPE_ICONS, CHART_TYPE_LABELS } from "@/lib/dashboard/widget-data-helpers";
import { cn } from "@/lib/utils";

type WidgetPayload = {
  title: string;
  chartType: string;
  dataSource: string;
  size: string;
  config: string;
};

type AddWidgetModalProps = {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  userId: string | null;
  onAdd: (widget: WidgetPayload) => void;
  editWidget?: WidgetPayload & { id: string };
  onSaveEdit?: (widgetId: string, widget: WidgetPayload) => void;
};

type VisualPreset = "operaciones" | "sla";
type PersistedVisualSettings = {
  accentColor: string;
  showLegend: boolean;
  showGrid: boolean;
  smoothLines: boolean;
  metricFormat: MetricFormat;
};

function getDefaultSeriesLabels(dataSource: string) {
  if (dataSource === "sla_compliance") {
    return { serieA: "En plazo", serieB: "Fuera de plazo", serieC: "—" };
  }
  if (dataSource === "tickets_trend") {
    return { serieA: "Creados", serieB: "Resueltos", serieC: "—" };
  }
  return { serieA: "Principal", serieB: "Secundaria", serieC: "Auxiliar" };
}

function getVisualSettingsStorageKey(dashboardId: string, userId: string | null) {
  return `dashboard-widget-visual:${userId ?? "anon"}:${dashboardId}`;
}

export function AddWidgetModal({
  open,
  onClose,
  onAdd,
  onSaveEdit,
  editWidget,
  dashboardId,
  userId,
}: AddWidgetModalProps) {
  const isEditMode = Boolean(editWidget);
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
    if (editWidget) {
      setTitle(editWidget.title);
      setChartType(editWidget.chartType as ChartType);
      setDataSource(editWidget.dataSource);
      setSize(editWidget.size as "small" | "medium" | "large");
      try {
        const cfg = JSON.parse(editWidget.config || "{}") as {
          manualData?: string;
          accentColor?: string;
          showLegend?: boolean;
          showGrid?: boolean;
          smoothLines?: boolean;
          metricFormat?: MetricFormat;
          seriesLabels?: { serieA?: string; serieB?: string; serieC?: string };
          lockSeriesLabels?: boolean;
        };
        if (cfg.manualData) setManualData(JSON.stringify(cfg.manualData));
        if (cfg.accentColor) setAccentColor(cfg.accentColor);
        setShowLegend(cfg.showLegend ?? true);
        setShowGrid(cfg.showGrid ?? true);
        setSmoothLines(cfg.smoothLines ?? true);
        setMetricFormat(cfg.metricFormat ?? "number");
        setSeriesLabelA(cfg.seriesLabels?.serieA ?? "Principal");
        setSeriesLabelB(cfg.seriesLabels?.serieB ?? "Secundaria");
        setSeriesLabelC(cfg.seriesLabels?.serieC ?? "Auxiliar");
        setLockSeriesLabels(Boolean(cfg.lockSeriesLabels));
      } catch {
        // ignore
      }
    } else {
      setTitle("");
      setChartType("bar");
      setDataSource("backlog_by_status");
      setSize("medium");
    }
  }, [open, editWidget]);

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

  useEffect(() => {
    if (!open || isEditMode) return;
    const meta = getDataSourceMeta(dataSource);
    if (!meta) return;
    const nextChart = pickDefaultChart(dataSource);
    setChartType(nextChart);
    if (!title.trim()) setTitle(meta.defaultTitle);
  }, [dataSource, open, isEditMode, title]);

  useEffect(() => {
    const allowed = getCompatibleCharts(dataSource);
    if (allowed.length > 0 && !allowed.includes(chartType)) {
      setChartType(allowed[0]!);
    }
  }, [dataSource, chartType]);

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
    } else {
      next = {
        accentColor: "#059669",
        showLegend: true,
        showGrid: true,
        smoothLines: true,
        metricFormat: "percent",
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
      const base: Record<string, unknown> = {
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
      };
      if (dataSource.startsWith("embed_") || dataSource === "operation_links") {
        const minH =
          dataSource === "embed_tickets"
            ? 520
            : dataSource === "embed_preventive"
              ? 360
              : 320;
        const col = dataSource === "embed_tickets" ? 4 : 2;
        base.layout = { colSpan: col, minHeightPx: minH };
      }
      config = JSON.stringify(base);
    }

    try {
      const key = getVisualSettingsStorageKey(dashboardId, userId);
      const persist: PersistedVisualSettings = { accentColor, showLegend, showGrid, smoothLines, metricFormat };
      window.localStorage.setItem(key, JSON.stringify(persist));
    } catch {
      // ignore persistence errors
    }

    const payload: WidgetPayload = {
      title: safeTitle,
      chartType: isEmbedDataSource(dataSource) || dataSource === "operation_links" ? "bar" : chartType,
      dataSource,
      size,
      config,
    };

    if (isEditMode && editWidget && onSaveEdit) {
      onSaveEdit(editWidget.id, payload);
    } else {
      onAdd(payload);
    }
    onClose();
  };

  const compatibleCharts = getCompatibleCharts(dataSource);
  const selectedMeta = getDataSourceMeta(dataSource);
  const showChartPicker = compatibleCharts.length > 0;

  if (!open) {
    return null;
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="md"
      className="max-h-[85vh] overflow-hidden"
      shake={Boolean(error)}
      title={isEditMode ? "Editar widget" : "Añadir widget"}
      footer={
        <>
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
            {isEditMode ? "Guardar cambios" : "Añadir widget"}
          </button>
        </>
      }
    >
        <div
          className="space-y-3 overflow-y-auto pr-1 max-h-[calc(85vh-140px)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0"
        >
          <div>
            <label className="text-label block mb-1.5">Fuente de datos</label>
            <Select
              value={dataSource}
              onChange={(e) => {
                setDataSource(e.target.value);
                const meta = getDataSourceMeta(e.target.value);
                if (meta && !isEditMode) setTitle(meta.defaultTitle);
              }}
            >
              {DATA_SOURCE_GROUPS.map((group) => (
                <optgroup key={group.title} label={group.title}>
                  {group.sources.map((sourceId) => {
                    const meta = getDataSourceMeta(sourceId);
                    return (
                      <option key={sourceId} value={sourceId}>
                        {meta?.label ?? sourceId}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </Select>
            {selectedMeta ? (
              <p className="mt-1.5 text-[11px] text-[var(--color-text-3)]">{selectedMeta.description}</p>
            ) : null}
          </div>

          <div>
            <label className="text-label block mb-1.5">Título del widget</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del widget"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all"
            />
          </div>

          {showChartPicker ? (
            <div>
              <label className="text-label block mb-1.5">Tipo de gráfica</label>
              <div className="grid grid-cols-5 gap-1.5 mt-2 max-h-56 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0">
                {compatibleCharts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setChartType(value)}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-all",
                      chartType === value
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-3)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-2)]",
                    )}
                  >
                    <span className="text-base leading-none mb-1">{CHART_TYPE_ICONS[value] ?? "▣"}</span>
                    <span className="text-[10px] leading-tight">{CHART_TYPE_LABELS[value] ?? value}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {dataSource === "operation_links" || isEmbedDataSource(dataSource) ? (
            <p className="text-[11px] text-[var(--color-text-3)]">
              {dataSource === "operation_links"
                ? "Varios accesos en un solo bloque. El tipo de gráfica no aplica."
                : "Vista embebida compacta. Ajusta ancho y alto en modo edición del panel."}
            </p>
          ) : null}

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
                <Select
                  value={metricFormat}
                  onChange={(e) => setMetricFormat(e.target.value as MetricFormat)}
                >
                  <option value="number">Formato: Número</option>
                  <option value="compact">Formato: Compacto (k, M)</option>
                  <option value="integer">Formato: Entero</option>
                  <option value="percent">Formato: Porcentaje</option>
                </Select>
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
            <Select
              value={size}
              onChange={(e) => setSize(e.target.value as "small" | "medium" | "large")}
            >
              <option value="small">Pequeño (1/4)</option>
              <option value="medium">Mediano (1/2)</option>
              <option value="large">Grande (completo)</option>
            </Select>
          </div>

          {error ? <p className="text-xs text-[var(--color-error)]">{error}</p> : null}
        </div>
    </ModalShell>
  );
}
