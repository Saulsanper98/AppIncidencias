"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, LayoutDashboard, Settings2, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import "../dashboard-builder.css";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";

import { AddWidgetModal } from "@/components/dashboard-builder/add-widget-modal";
import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { DashboardBuilderToolbar } from "@/components/dashboard-builder/dashboard-builder-toolbar";
import { SortableWidget } from "@/components/dashboard-builder/sortable-widget";
import { VisualPresetPicker } from "@/components/dashboard-builder/visual-preset-picker";
import { WidgetRenderer } from "@/components/dashboard-builder/widget-renderer";
import { getPresentationStaggerDelayMs } from "@/components/dashboard-builder/charts/chart-utils";
import { Badge } from "@/components/ui/badge";
import { SectionTabs } from "@/components/ui/section-tabs";
import { CHART_TYPES, type ChartType } from "@/lib/dashboard/chart-types";
import { EMPTY_DASHBOARD_DATA, mergeDashboardData, type CustomDashboardData } from "@/lib/dashboard/dashboard-data-types";
import { getCompatibleCharts, pickDefaultChart } from "@/lib/dashboard/data-sources";
import { isLegacyEmbedDataSource } from "@/lib/dashboard/widget-data-helpers";
import {
  getSavedPresetsKey,
  saveLastVisualSettings,
  type SavedVisualPreset,
  type VisualPresetSettings,
} from "@/lib/dashboard/visual-preset-system";
import { mergeLayoutIntoConfig, parseWidgetLayout } from "@/lib/dashboard/widget-layout";
import { getEffectiveColSpan } from "@/lib/dashboard/widget-density";
import { cn } from "@/lib/utils";
import type { SessionUser, UserRole } from "@/lib/domain";

type DashboardWidget = {
  id: string;
  title: string;
  chartType: string;
  dataSource: string;
  size: string;
  order: number;
  config: string;
};

type DashboardItem = {
  id: string;
  name: string;
  createdAt: string;
  createdByUserId: string | null;
  widgets: DashboardWidget[];
};

type DashboardData = CustomDashboardData;

type VisualPreset = SavedVisualPreset;

const emptyData: DashboardData = EMPTY_DASHBOARD_DATA;

/**
 * Redimensionado manual del grid (columnas + asa de altura libre + presets).
 * Cada cambio persiste vía PATCH /api/dashboards/[id]/widgets con `config.layout = { colSpan, minHeightPx }`.
 */
const WIDGET_MANUAL_LAYOUT_EDIT_ENABLED = true;

export default function DashboardBuilderPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;
  const router = useRouter();

  const [dashboard, setDashboard] = useState<DashboardItem | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [role, setRole] = useState<UserRole>("conductor");
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [editWidget, setEditWidget] = useState<DashboardWidget | null>(null);
  const [days, setDays] = useState<number>(7);
  const [dataRefreshing, setDataRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [savedPresets, setSavedPresets] = useState<VisualPreset[]>([]);
  const [activeBuiltinPresetId, setActiveBuiltinPresetId] = useState<string | null>(null);
  const [showEditHelp, setShowEditHelp] = useState(false);
  const [focusedWidgetId, setFocusedWidgetId] = useState<string | null>(null);
  const [isMobileGrid, setIsMobileGrid] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // Preview en vivo del redimensionado de cada widget. Lo emite `SortableWidget`
  // en cada `mousemove` mientras se arrastra un asa y se limpia al soltar. Lo
  // usamos para recalcular `chartHeight` frame a frame y que Recharts redibuje
  // la gráfica al instante (de lo contrario solo cambiaría el wrapper).
  const [livePreviewById, setLivePreviewById] = useState<
    Record<string, { colSpan?: number; minHeightPx?: number }>
  >({});
  const skipNamePatchRef = useRef(false);
  const dashboardRef = useRef<DashboardItem | null>(null);
  const undoStackRef = useRef<DashboardWidget[][]>([]);
  const redoStackRef = useRef<DashboardWidget[][]>([]);
  const widgetRootRefs = useRef<Record<string, HTMLDivElement | null>>({});
  dashboardRef.current = dashboard;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor),
  );
  const presetStorageKey = useMemo(
    () => getSavedPresetsKey(dashboardId, sessionUserId),
    [sessionUserId, dashboardId],
  );

  const fetchDashboard = useCallback(async () => {
    const response = await fetch(`/api/dashboards/${dashboardId}`, { cache: "no-store" });
    const payload = (await response.json()) as {
      dashboard?: DashboardItem;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(payload.message ?? "No se pudieron cargar dashboards");
    }
    setDashboard(payload.dashboard ?? null);
  }, [dashboardId]);

  const fetchData = useCallback(async () => {
    setDataRefreshing(true);
    try {
      const widgets = dashboardRef.current?.widgets ?? [];
      const sources = [...new Set(widgets.map((w) => w.dataSource).filter(Boolean))];
      const params = new URLSearchParams({ days: String(days) });
      if (sources.length > 0) params.set("sources", sources.join(","));
      const dataResponse = await fetch(`/api/dashboards/${dashboardId}/data?${params.toString()}`, {
        cache: "no-store",
      });
      const dataPayload = (await dataResponse.json()) as Partial<CustomDashboardData> & { message?: string };
      if (!dataResponse.ok) {
        throw new Error(dataPayload.message ?? "No se pudieron cargar datos del dashboard");
      }
      setData((prev) => mergeDashboardData(prev, dataPayload));
      const stamp = dataPayload.generatedAt ? new Date(dataPayload.generatedAt) : new Date();
      setLastRefreshedAt(
        stamp.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      );
    } finally {
      setDataRefreshing(false);
    }
  }, [dashboardId, days]);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        const sessionData = (await sessionResponse.json()) as { authenticated: boolean; user?: SessionUser };
        if (sessionData.authenticated && sessionData.user) {
          setRole(sessionData.user.role);
          setSessionUserId(sessionData.user.id);
        }

        await fetchDashboard();
        await fetchData();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el dashboard");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [dashboardId, fetchDashboard, fetchData]);

  useEffect(() => {
    if (loading) return;
    void fetchData();
  }, [days, loading, fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const handle = window.setInterval(() => {
      void fetchData();
    }, 60_000);
    return () => window.clearInterval(handle);
  }, [autoRefresh, fetchData]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobileGrid(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(presetStorageKey);
      if (!raw) return;
      setSavedPresets(JSON.parse(raw) as VisualPreset[]);
    } catch {
      setSavedPresets([]);
    }
  }, [presetStorageKey]);

  const persistPresets = useCallback(
    (next: VisualPreset[]) => {
      setSavedPresets(next);
      try {
        window.localStorage.setItem(presetStorageKey, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
    },
    [presetStorageKey],
  );

  const handleAddWidget = async (widget: {
    title: string;
    chartType: string;
    dataSource: string;
    size: string;
    config: string;
  }) => {
    try {
      setError(null);
      const response = await fetch(`/api/dashboards/${dashboardId}/widgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(widget),
      });
      const payload = (await response.json()) as { message?: string; widget?: DashboardWidget };
      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo añadir el widget");
      }
      setAddWidgetOpen(false);
      if (payload.widget) {
        setDashboard((prev) => {
          if (!prev) return prev;
          return { ...prev, widgets: [...prev.widgets, payload.widget!] };
        });
      } else {
        await fetchDashboard();
      }
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "No se pudo añadir el widget");
    }
  };

  const handleSaveEditWidget = async (
    widgetId: string,
    widget: { title: string; chartType: string; dataSource: string; size: string; config: string },
  ) => {
    try {
      setError(null);
      const ok = await updateWidget(widgetId, widget);
      if (!ok) return;
      setDashboard((prev) =>
        prev
          ? {
              ...prev,
              widgets: prev.widgets.map((w) => (w.id === widgetId ? { ...w, ...widget } : w)),
            }
          : prev,
      );
      setEditWidget(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el widget");
    }
  };

  const handleRemoveWidget = async (widgetId: string) => {
    try {
      setError(null);
      const response = await fetch(`/api/dashboards/${dashboardId}/widgets`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetId }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo eliminar el widget");
      }
      setDashboard((prev) => {
        if (!prev) return prev;
        return { ...prev, widgets: prev.widgets.filter((widget) => widget.id !== widgetId) };
      });
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "No se pudo eliminar el widget");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !dashboard) return;

    const sorted = [...dashboard.widgets].sort((a, b) => a.order - b.order);
    const oldIndex = sorted.findIndex((item) => item.id === active.id);
    const newIndex = sorted.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const moved = arrayMove(sorted, oldIndex, newIndex).map((item, index) => ({
      ...item,
      order: index + 1,
    }));

    setDashboard((prev) => (prev ? { ...prev, widgets: moved } : prev));

    try {
      const response = await fetch(`/api/dashboards/${dashboardId}/widgets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetOrders: moved.map((item) => ({ id: item.id, order: item.order })),
        }),
      });
      if (!response.ok) {
        throw new Error("No se pudo guardar el orden");
      }
    } catch {
      await fetchDashboard();
    }
  };

  const parseWidgetConfig = (config: string) => {
    try {
      return JSON.parse(config) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const updateWidget = useCallback(async (widgetId: string, patch: Record<string, unknown>) => {
    const response = await fetch(`/api/dashboards/${dashboardId}/widgets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ widgetId, ...patch }),
    });
    return response.ok;
  }, [dashboardId]);

  const syncHistoryState = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const pushUndoSnapshot = useCallback(() => {
    const d = dashboardRef.current;
    if (!d?.widgets.length) return;
    redoStackRef.current = [];
    try {
      undoStackRef.current.push(structuredClone(d.widgets));
    } catch {
      undoStackRef.current.push(JSON.parse(JSON.stringify(d.widgets)) as DashboardWidget[]);
    }
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
    syncHistoryState();
  }, [syncHistoryState]);

  const livePreviewDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleWidgetLivePreview = useCallback(
    (widgetId: string, preview: { colSpan?: number; minHeightPx?: number } | null) => {
      const clearTimer = () => {
        const pending = livePreviewDebounceRef.current[widgetId];
        if (pending) {
          clearTimeout(pending);
          delete livePreviewDebounceRef.current[widgetId];
        }
      };

      if (preview === null) {
        clearTimer();
        setLivePreviewById((prev) => {
          if (!(widgetId in prev)) return prev;
          const next = { ...prev };
          delete next[widgetId];
          return next;
        });
        return;
      }

      clearTimer();
      livePreviewDebounceRef.current[widgetId] = setTimeout(() => {
        setLivePreviewById((prev) => {
          const current = prev[widgetId];
          if (
            current &&
            current.colSpan === preview.colSpan &&
            current.minHeightPx === preview.minHeightPx
          ) {
            return prev;
          }
          return { ...prev, [widgetId]: preview };
        });
        delete livePreviewDebounceRef.current[widgetId];
      }, 80);
    },
    [],
  );

  const handleWidgetLayoutPatch = useCallback(
    async (widgetId: string, patch: { colSpan?: number; minHeightPx?: number }) => {
      if (role !== "gestor_centro_control") return;
      pushUndoSnapshot();
      const w = dashboardRef.current?.widgets.find((item) => item.id === widgetId);
      if (!w) return;
      const nextConfig = mergeLayoutIntoConfig(w.config, patch);
      const prevConfig = w.config;
      setError(null);
      setDashboard((prev) =>
        prev
          ? {
              ...prev,
              widgets: prev.widgets.map((widget) =>
                widget.id === widgetId ? { ...widget, config: nextConfig } : widget,
              ),
            }
          : prev,
      );
      const ok = await updateWidget(widgetId, { config: nextConfig });
      if (!ok) {
        setError("No se pudo guardar el tamaño del widget. ¿Sigues en sesión como gestor?");
        setDashboard((prev) =>
          prev
            ? {
                ...prev,
                widgets: prev.widgets.map((widget) =>
                  widget.id === widgetId ? { ...widget, config: prevConfig } : widget,
                ),
              }
            : prev,
        );
        await fetchDashboard();
      }
    },
    [role, pushUndoSnapshot, updateWidget, fetchDashboard],
  );

  const handleUndo = useCallback(async () => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack.pop();
    if (!prev) return;
    const d = dashboardRef.current;
    if (!d) return;
    try {
      redoStackRef.current.push(structuredClone(d.widgets));
    } catch {
      redoStackRef.current.push(JSON.parse(JSON.stringify(d.widgets)) as DashboardWidget[]);
    }
    if (redoStackRef.current.length > 20) redoStackRef.current.shift();
    setDashboard({ ...d, widgets: prev });
    setError(null);
    const results = await Promise.all(
      prev.map((w) =>
        updateWidget(w.id, {
          chartType: w.chartType,
          dataSource: w.dataSource,
          size: w.size,
          config: w.config,
        }),
      ),
    );
    if (results.some((ok) => !ok)) {
      setError("No se pudo sincronizar al deshacer; recarga el dashboard.");
    }
    syncHistoryState();
  }, [updateWidget, syncHistoryState]);

  const handleRedo = useCallback(async () => {
    const rstack = redoStackRef.current;
    if (rstack.length === 0) return;
    const next = rstack.pop();
    if (!next) return;
    const d = dashboardRef.current;
    if (!d) return;
    try {
      undoStackRef.current.push(structuredClone(d.widgets));
    } catch {
      undoStackRef.current.push(JSON.parse(JSON.stringify(d.widgets)) as DashboardWidget[]);
    }
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
    setDashboard({ ...d, widgets: next });
    setError(null);
    const results = await Promise.all(
      next.map((w) =>
        updateWidget(w.id, {
          chartType: w.chartType,
          dataSource: w.dataSource,
          size: w.size,
          config: w.config,
        }),
      ),
    );
    if (results.some((ok) => !ok)) {
      setError("No se pudo sincronizar al rehacer; recarga el dashboard.");
    }
    syncHistoryState();
  }, [updateWidget, syncHistoryState]);

  const handleExportPng = useCallback(async (widgetId: string) => {
    const el = widgetRootRefs.current[widgetId];
    if (!el) {
      setError("No se pudo exportar: contenedor no disponible.");
      return;
    }
    try {
      setError(null);
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `widget-${widgetId.slice(0, 10)}.png`;
      a.click();
    } catch {
      setError("No se pudo generar el PNG del widget.");
    }
  }, []);

  const handleDuplicateWidget = async (widgetId: string) => {
    const current = sortedWidgets.find((item) => item.id === widgetId);
    if (!current) return;
    await handleAddWidget({
      title: `${current.title} (copia)`,
      chartType: current.chartType,
      dataSource: current.dataSource,
      size: current.size,
      config: current.config,
    });
  };

  const handleToggleLegendWidget = async (widgetId: string) => {
    pushUndoSnapshot();
    const current = sortedWidgets.find((item) => item.id === widgetId);
    if (!current) return;
    const config = parseWidgetConfig(current.config);
    const next = JSON.stringify({ ...config, showLegend: !(config.showLegend ?? true) });
    const ok = await updateWidget(widgetId, { config: next });
    if (!ok) return;
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            widgets: prev.widgets.map((widget) => (widget.id === widgetId ? { ...widget, config: next } : widget)),
          }
        : prev,
    );
  };

  const handleCycleChartType = async (widgetId: string) => {
    pushUndoSnapshot();
    const current = sortedWidgets.find((item) => item.id === widgetId);
    if (!current) return;
    const allowed = getCompatibleCharts(current.dataSource);
    const pool = allowed.length > 0 ? allowed : CHART_TYPES;
    const index = pool.indexOf(current.chartType as ChartType);
    const nextIndex =
      index < 0 ? Math.max(0, pool.indexOf(pickDefaultChart(current.dataSource))) : (index + 1) % pool.length;
    const nextChartType = pool[nextIndex] ?? pool[0] ?? "bar";
    const ok = await updateWidget(widgetId, { chartType: nextChartType });
    if (!ok) return;
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            widgets: prev.widgets.map((widget) => (widget.id === widgetId ? { ...widget, chartType: nextChartType } : widget)),
          }
        : prev,
    );
  };

  const handleResetVisual = async (widgetId: string) => {
    pushUndoSnapshot();
    const current = sortedWidgets.find((item) => item.id === widgetId);
    if (!current) return;
    const config = parseWidgetConfig(current.config);
    const next = JSON.stringify({
      ...config,
      accentColor: "#2563EB",
      showLegend: true,
      showGrid: true,
      smoothLines: true,
      metricFormat: "number",
    });
    const ok = await updateWidget(widgetId, { config: next });
    if (!ok) return;
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            widgets: prev.widgets.map((widget) => (widget.id === widgetId ? { ...widget, config: next } : widget)),
          }
        : prev,
    );
  };

  const handleQuickChangeSource = async (widgetId: string, dataSource: string) => {
    pushUndoSnapshot();
    const ok = await updateWidget(widgetId, { dataSource });
    if (!ok) return;
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            widgets: prev.widgets.map((widget) => (widget.id === widgetId ? { ...widget, dataSource } : widget)),
          }
        : prev,
    );
  };

  const handleMigrateLegacySource = async (widgetId: string, dataSource: string, title: string) => {
    pushUndoSnapshot();
    const ok = await updateWidget(widgetId, { dataSource, title });
    if (!ok) return;
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            widgets: prev.widgets.map((widget) =>
              widget.id === widgetId ? { ...widget, dataSource, title } : widget,
            ),
          }
        : prev,
    );
  };

  const handleSaveCurrentAsPreset = () => {
    if (!presetName.trim()) return;
    if (sortedWidgets.length === 0) return;
    const accentCounts = new Map<string, number>();
    let showLegend = true;
    let showGrid = true;
    let smoothLines = true;
    let metricFormat: VisualPreset["settings"]["metricFormat"] = "number";
    for (const widget of sortedWidgets) {
      const cfg = parseWidgetConfig(widget.config);
      const accent = String(cfg.accentColor ?? "#2563EB");
      accentCounts.set(accent, (accentCounts.get(accent) ?? 0) + 1);
      if (cfg.showLegend === false) showLegend = false;
      if (cfg.showGrid === false) showGrid = false;
      if (cfg.smoothLines === false) smoothLines = false;
      if (cfg.metricFormat) metricFormat = cfg.metricFormat as VisualPreset["settings"]["metricFormat"];
    }
    const dominantAccent =
      [...accentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#2563EB";
    const nextPreset: VisualPreset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      favorite: false,
      settings: {
        accentColor: dominantAccent,
        showLegend,
        showGrid,
        smoothLines,
        metricFormat,
      },
    };
    persistPresets([nextPreset, ...savedPresets]);
    setPresetName("");
  };

  const handleExportDashboardJson = () => {
    if (!dashboard) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      dashboard: {
        name: dashboard.name,
        widgets: sortedWidgets.map((widget) => ({
          title: widget.title,
          chartType: widget.chartType,
          dataSource: widget.dataSource,
          size: widget.size,
          order: widget.order,
          config: parseWidgetConfig(widget.config),
        })),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${dashboard.name.replace(/\s+/g, "-").toLowerCase()}-panel.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDuplicateDashboard = async () => {
    try {
      const response = await fetch(`/api/dashboards/${dashboardId}/duplicate`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json()) as { dashboard?: { id: string }; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo duplicar el panel");
      }
      if (payload.dashboard?.id) {
        router.push(`/dashboards/${payload.dashboard.id}`);
      }
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "No se pudo duplicar el panel");
    }
  };

  const applyPresetToAllWidgets = async (preset: VisualPreset) => {
    if (!dashboard) return;
    pushUndoSnapshot();
    const updates = await Promise.all(
      dashboard.widgets.map(async (widget) => {
        const config = parseWidgetConfig(widget.config);
        const nextConfig = JSON.stringify({ ...config, ...preset.settings });
        const ok = await updateWidget(widget.id, { config: nextConfig });
        return { id: widget.id, ok, config: nextConfig };
      }),
    );
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            widgets: prev.widgets.map((widget) => {
              const updated = updates.find((item) => item.id === widget.id);
              return updated?.ok ? { ...widget, config: updated.config } : widget;
            }),
          }
        : prev,
    );
  };

  const applyBuiltinPreset = async (settings: VisualPresetSettings, presetId: string) => {
    if (!dashboard) return;
    setActiveBuiltinPresetId(presetId);
    saveLastVisualSettings(dashboardId, sessionUserId, settings);
    pushUndoSnapshot();
    const updates = await Promise.all(
      dashboard.widgets.map(async (widget) => {
        const config = parseWidgetConfig(widget.config);
        const nextConfig = JSON.stringify({ ...config, ...settings });
        const ok = await updateWidget(widget.id, { config: nextConfig });
        return { id: widget.id, ok, config: nextConfig };
      }),
    );
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            widgets: prev.widgets.map((widget) => {
              const updated = updates.find((item) => item.id === widget.id);
              return updated?.ok ? { ...widget, config: updated.config } : widget;
            }),
          }
        : prev,
    );
  };

  const togglePresetFavorite = (presetId: string) => {
    persistPresets(savedPresets.map((preset) => (preset.id === presetId ? { ...preset, favorite: !preset.favorite } : preset)));
  };

  const sortedWidgets = useMemo(
    () => [...(dashboard?.widgets ?? [])].sort((a, b) => a.order - b.order),
    [dashboard?.widgets],
  );

  const legacyEmbedCount = useMemo(
    () => sortedWidgets.filter((widget) => isLegacyEmbedDataSource(widget.dataSource)).length,
    [sortedWidgets],
  );

  const handleUndoRef = useRef(handleUndo);
  handleUndoRef.current = handleUndo;
  const handleRedoRef = useRef(handleRedo);
  handleRedoRef.current = handleRedo;
  const handleToggleLegendRef = useRef(handleToggleLegendWidget);
  handleToggleLegendRef.current = handleToggleLegendWidget;
  const sortedWidgetsRef = useRef(sortedWidgets);
  sortedWidgetsRef.current = sortedWidgets;
  const focusedWidgetIdRef = useRef(focusedWidgetId);
  focusedWidgetIdRef.current = focusedWidgetId;

  useEffect(() => {
    if (!isEditing || role !== "gestor_centro_control") return;
    setFocusedWidgetId((prev) => prev ?? sortedWidgets[0]?.id ?? null);
  }, [isEditing, role, sortedWidgets]);

  useEffect(() => {
    if (role !== "gestor_centro_control" || !isEditing) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        void handleRedoRef.current();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        void handleRedoRef.current();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        void handleUndoRef.current();
        return;
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setPresentationMode((v) => !v);
        return;
      }
      if (e.key === "l" || e.key === "L") {
        const fid = focusedWidgetIdRef.current;
        if (!fid) return;
        e.preventDefault();
        void handleToggleLegendRef.current(fid);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const ids = sortedWidgetsRef.current.map((w) => w.id);
        if (ids.length === 0) return;
        e.preventDefault();
        let idx = focusedWidgetIdRef.current ? ids.indexOf(focusedWidgetIdRef.current) : 0;
        if (idx < 0) idx = 0;
        const nextIndex =
          e.key === "ArrowRight" ? (idx + 1) % ids.length : (idx - 1 + ids.length) % ids.length;
        setFocusedWidgetId(ids[nextIndex] ?? null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [role, isEditing]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-72 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
        <div className="grid grid-cols-[repeat(100,minmax(0,1fr))] gap-0">
          <div className="h-64 animate-pulse rounded-xl bg-[var(--color-surface-2)]" style={{ gridColumn: "span 50 / span 50" }} />
          <div className="h-64 animate-pulse rounded-xl bg-[var(--color-surface-2)]" style={{ gridColumn: "span 50 / span 50" }} />
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LayoutDashboard size={44} className="mb-3 text-[var(--color-text-3)]" />
        <p className="text-subheading text-[var(--color-text-2)]">Dashboard no encontrado</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", presentationMode && "space-y-3")}>
      {!presentationMode ? <SectionTabs preset="dashboard" /> : null}
      {error ? (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      {legacyEmbedCount > 0 && !presentationMode ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-[var(--color-text-2)]">
          <p className="font-medium text-amber-200/95">
            {legacyEmbedCount === 1
              ? "Hay 1 widget obsoleto (mapa embebido)."
              : `Hay ${legacyEmbedCount} widgets obsoletos (mapa embebido).`}
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-text-3)]">
            Abre cada bloque afectado y usa «Migrar a bandeja» o «Migrar a desvíos» para actualizarlo con un clic.
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[color-mix(in_oklab,var(--color-accent)_8%,transparent)] p-4 shadow-sm">
          <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[var(--color-accent)]/10 blur-2xl" />
          <div className="relative space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/dashboards"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-1)]"
              >
                <ArrowLeft size={16} />
              </Link>
              <div className="min-w-0 flex-1">
                {editingName !== null ? (
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={async () => {
                      if (skipNamePatchRef.current) {
                        skipNamePatchRef.current = false;
                        setEditingName(null);
                        return;
                      }
                      if (editingName && editingName !== dashboard.name) {
                        await fetch(`/api/dashboards/${dashboardId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: editingName }),
                        });
                        await fetchDashboard();
                      }
                      setEditingName(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        skipNamePatchRef.current = true;
                        setEditingName(null);
                      }
                    }}
                    className="w-full max-w-md bg-transparent text-xl font-semibold text-[var(--color-text-1)] border-b border-[var(--color-accent)] focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h1
                      className={cn(
                        "truncate text-xl font-semibold tracking-tight text-[var(--color-text-1)]",
                        isEditing && role === "gestor_centro_control" && "cursor-text hover:text-[var(--color-accent)]",
                      )}
                      onClick={() => isEditing && role === "gestor_centro_control" && setEditingName(dashboard.name)}
                    >
                      {dashboard.name}
                    </h1>
                    {!presentationMode ? (
                      <FeedbackTargetButton
                        id={`dashboards/${dashboardId}`}
                        label={dashboard.name}
                        placement="inline"
                      />
                    ) : null}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-3)]">
                  <Badge variant="neutral">{dashboard.widgets.length} widgets</Badge>
                </div>
              </div>
            </div>

            <DashboardBuilderToolbar
              embedded
              days={days}
              onDaysChange={setDays}
              onRefresh={() => void fetchData()}
              dataRefreshing={dataRefreshing}
              autoRefresh={autoRefresh}
              onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
              lastRefreshedAt={lastRefreshedAt}
              periodComparison={data?.periodComparison ?? null}
              isEditing={isEditing}
              onToggleEditing={() => {
                setIsEditing((prev) => {
                  if (prev) setFocusedWidgetId(null);
                  return !prev;
                });
              }}
              presentationMode={presentationMode}
              onTogglePresentation={() => setPresentationMode((v) => !v)}
              onAddWidget={() => setAddWidgetOpen(true)}
              canEdit={role === "gestor_centro_control"}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={() => void handleUndo()}
              onRedo={() => void handleRedo()}
              onExportJson={handleExportDashboardJson}
              onDuplicateDashboard={() => void handleDuplicateDashboard()}
            />
          </div>
        </div>
      </div>
      {role !== "gestor_centro_control" && !presentationMode ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] text-[var(--color-text-2)]">
          Vista de solo lectura. Solo el gestor del centro de control puede editar este panel.
        </div>
      ) : null}
      {role === "gestor_centro_control" && isEditing ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowEditHelp((v) => !v)}
            className="text-[11px] text-[var(--color-accent)] hover:underline"
          >
            {showEditHelp ? "Ocultar ayuda de edición" : "Ver ayuda de edición"}
          </button>
        </div>
      ) : null}
      {role === "gestor_centro_control" && isEditing && showEditHelp ? (
        <p className="-mt-1 mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[11px] text-[var(--color-text-3)]">
          Arrastra el asa inferior derecha para redimensionar · presets ¼–1/1 y S–XL · Ctrl+Z/Y deshacer · P presentación ·
          L leyenda · icono lápiz para editar fuente y gráfica.
        </p>
      ) : null}
      {role === "gestor_centro_control" && isEditing && !presentationMode ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={15} className="text-[var(--color-accent)]" />
            <div>
              <p className="text-sm font-medium text-[var(--color-text-1)]">Estilo del panel</p>
              <p className="text-[11px] text-[var(--color-text-3)]">Presets visuales en un clic para todos los widgets</p>
            </div>
          </div>
          <VisualPresetPicker
            activePresetId={activeBuiltinPresetId}
            onApply={(settings, presetId) => void applyBuiltinPreset(settings, presetId)}
          />
          <div className="mt-4 border-t border-[var(--color-border)] pt-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">Tus presets guardados</p>
          <div className="flex items-center gap-2">
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Nombre del preset (ej: SLA Ejecutivo)"
              className="h-9 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <button
              onClick={handleSaveCurrentAsPreset}
              className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-2)] hover:text-[var(--color-text-1)] hover:border-[var(--color-border-hover)]"
            >
              Guardar preset
            </button>
          </div>
          {savedPresets.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {savedPresets
                .slice()
                .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)))
                .map((preset) => (
                  <div key={preset.id} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
                    <button
                      onClick={() => applyPresetToAllWidgets(preset)}
                      className="rounded-md px-2 py-1 text-xs text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
                    >
                      {preset.name}
                    </button>
                    <button
                      onClick={() => togglePresetFavorite(preset.id)}
                      className={cn(
                        "rounded-md p-1",
                        preset.favorite ? "text-amber-400" : "text-[var(--color-text-3)] hover:text-[var(--color-text-2)]",
                      )}
                      aria-label="Marcar preset favorito"
                    >
                      <Star size={12} fill={preset.favorite ? "currentColor" : "none"} />
                    </button>
                  </div>
                ))}
            </div>
          ) : null}
          </div>
        </div>
      ) : null}
      {sortedWidgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/50 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <LayoutDashboard size={28} className="text-[var(--color-text-3)]" />
          </div>
          <p className="text-subheading text-[var(--color-text-2)]">Panel vacío</p>
          {role === "gestor_centro_control" ? (
            <>
              <p className="mb-4 mt-1 max-w-sm text-caption text-[var(--color-text-3)]">
                Añade widgets manualmente o vuelve a Cuadros y crea otro panel desde una plantilla.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setAddWidgetOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white transition-all hover:bg-[var(--color-accent-hover)]"
                >
                  <Settings2 size={14} />
                  Añadir primer widget
                </button>
                <Link
                  href="/dashboards"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-2)] hover:border-[var(--color-border-hover)]"
                >
                  Ver plantillas
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-1 text-caption">El gestor aún no ha añadido widgets</p>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedWidgets.map((widget) => widget.id)} strategy={rectSortingStrategy}>
            <div
              className={cn(
                // Grid de 100 columnas con `gap-0` para que las 99 separaciones
                // no devoren el ancho útil. El espacio visual entre widgets se
                // resuelve con padding interno en cada `SortableWidget`.
                "grid grid-cols-[repeat(100,minmax(0,1fr))] gap-0 [grid-auto-rows:minmax(min-content,auto)] -m-2",
              )}
            >
              {sortedWidgets.map((widget, index) => {
                const layout = parseWidgetLayout(widget.config, widget.size);
                const preview = livePreviewById[widget.id];
                const baseColSpan = preview?.colSpan ?? layout.colSpan;
                const displayColSpan = getEffectiveColSpan(baseColSpan, isMobileGrid);
                const effectiveMinHeightPx = preview?.minHeightPx ?? layout.minHeightPx;
                // Altura efectiva del chart = altura del widget menos cabecera/toolbar internos.
                // Cabecera (~92 px) + toolbar de edición (~40 px) + paddings.
                // Floor a 20 px (no a 160 como antes) para que el chart pueda
                // seguir encogiendo cuando el operador arrastra a alturas
                // pequeñas; antes se quedaba atascado en cuanto el widget
                // bajaba de los 310 px.
                const headerReserve = isEditing && !presentationMode ? 150 : 110;
                const chartHeight = Math.max(20, effectiveMinHeightPx - headerReserve);
                return (
                <SortableWidget
                  key={widget.id}
                  id={widget.id}
                  layoutColSpan={displayColSpan}
                  layoutMinHeightPx={layout.minHeightPx}
                  isEditing={isEditing}
                  onLayoutPatch={
                    WIDGET_MANUAL_LAYOUT_EDIT_ENABLED && role === "gestor_centro_control" && isEditing
                      ? (patch) => void handleWidgetLayoutPatch(widget.id, patch)
                      : undefined
                  }
                  onLivePreview={
                    WIDGET_MANUAL_LAYOUT_EDIT_ENABLED && role === "gestor_centro_control" && isEditing
                      ? (p) => handleWidgetLivePreview(widget.id, p)
                      : undefined
                  }
                >
                  <div className="h-full min-h-0">
                  <WidgetRenderer
                    dashboardId={dashboardId}
                    widget={{ ...widget, chartType: widget.chartType as ChartType }}
                    data={data ?? emptyData}
                    days={days}
                    isEditing={isEditing}
                    onRemove={handleRemoveWidget}
                    onDuplicate={handleDuplicateWidget}
                    onQuickToggleLegend={handleToggleLegendWidget}
                    onQuickCycleChartType={handleCycleChartType}
                    onQuickResetVisual={handleResetVisual}
                    onQuickChangeSource={handleQuickChangeSource}
                    onMigrateLegacySource={handleMigrateLegacySource}
                    presentationMode={presentationMode}
                    animationDelayMs={
                      presentationMode ? getPresentationStaggerDelayMs(index) : Math.min(index * 35, 260)
                    }
                    onRequestEdit={
                      role === "gestor_centro_control"
                        ? () => {
                            setIsEditing(true);
                            setEditWidget(widget);
                          }
                        : undefined
                    }
                    exportRootRef={(el) => {
                      widgetRootRefs.current[widget.id] = el;
                    }}
                    isKeyboardFocused={isEditing && focusedWidgetId === widget.id}
                    onWidgetPaneMouseDown={() => setFocusedWidgetId(widget.id)}
                    onExportWidget={
                      role === "gestor_centro_control" && isEditing
                        ? () => void handleExportPng(widget.id)
                        : undefined
                    }
                    chartHeight={chartHeight}
                  />
                  </div>
                </SortableWidget>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AddWidgetModal
        open={addWidgetOpen}
        onClose={() => setAddWidgetOpen(false)}
        onAdd={handleAddWidget}
        dashboardId={dashboardId}
        userId={sessionUserId}
      />
      <AddWidgetModal
        open={Boolean(editWidget)}
        onClose={() => setEditWidget(null)}
        onAdd={handleAddWidget}
        onSaveEdit={handleSaveEditWidget}
        editWidget={
          editWidget
            ? {
                id: editWidget.id,
                title: editWidget.title,
                chartType: editWidget.chartType,
                dataSource: editWidget.dataSource,
                size: editWidget.size,
                config: editWidget.config,
              }
            : undefined
        }
        dashboardId={dashboardId}
        userId={sessionUserId}
      />
    </div>
  );
}
