"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, LayoutDashboard, Plus, Presentation, Settings2, Star } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
import { SortableWidget } from "@/components/dashboard-builder/sortable-widget";
import { WidgetRenderer } from "@/components/dashboard-builder/widget-renderer";
import { Badge } from "@/components/ui/badge";
import { CHART_TYPES, type ChartType } from "@/lib/dashboard/chart-types";
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

type DashboardData = {
  tickets_by_status: { name: string; value: number }[];
  tickets_by_operator: { name: string; value: number }[];
  tickets_by_priority: { name: string; value: number }[];
  sla_compliance: { day: string; cumplido: number; incumplido: number }[];
};

type VisualPreset = {
  id: string;
  name: string;
  favorite?: boolean;
  settings: {
    accentColor: string;
    showLegend: boolean;
    showGrid: boolean;
    smoothLines: boolean;
    metricFormat: "number" | "compact" | "percent" | "integer";
  };
};

const emptyData: DashboardData = {
  tickets_by_status: [],
  tickets_by_operator: [],
  tickets_by_priority: [],
  sla_compliance: [],
};

export default function DashboardBuilderPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;

  const [dashboard, setDashboard] = useState<DashboardItem | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [role, setRole] = useState<UserRole>("conductor");
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [savedPresets, setSavedPresets] = useState<VisualPreset[]>([]);
  const [focusedWidgetId, setFocusedWidgetId] = useState<string | null>(null);
  const skipNamePatchRef = useRef(false);
  const dashboardRef = useRef<DashboardItem | null>(null);
  const undoStackRef = useRef<DashboardWidget[][]>([]);
  const redoStackRef = useRef<DashboardWidget[][]>([]);
  const widgetRootRefs = useRef<Record<string, HTMLDivElement | null>>({});
  dashboardRef.current = dashboard;

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  const presetStorageKey = useMemo(
    () => `dashboard-presets:${sessionUserId ?? "anon"}:${dashboardId}`,
    [sessionUserId, dashboardId],
  );

  const fetchDashboard = useCallback(async () => {
    const dashboardsResponse = await fetch("/api/dashboards", { cache: "no-store" });
    const dashboardsPayload = (await dashboardsResponse.json()) as {
      dashboards?: DashboardItem[];
      message?: string;
    };
    if (!dashboardsResponse.ok) {
      throw new Error(dashboardsPayload.message ?? "No se pudieron cargar dashboards");
    }
    const found = (dashboardsPayload.dashboards ?? []).find((item) => item.id === dashboardId) ?? null;
    setDashboard(found);
  }, [dashboardId]);

  const fetchData = useCallback(async () => {
    const dataResponse = await fetch(`/api/dashboards/${dashboardId}/data`, { cache: "no-store" });
    const dataPayload = (await dataResponse.json()) as DashboardData & { message?: string };
    if (!dataResponse.ok) {
      throw new Error(dataPayload.message ?? "No se pudieron cargar datos del dashboard");
    }
    setData({
      tickets_by_status: dataPayload.tickets_by_status ?? [],
      tickets_by_operator: dataPayload.tickets_by_operator ?? [],
      tickets_by_priority: dataPayload.tickets_by_priority ?? [],
      sla_compliance: dataPayload.sla_compliance ?? [],
    });
  }, [dashboardId]);

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

  const handleResizeWidget = async (widgetId: string, size: string) => {
    pushUndoSnapshot();
    const response = await fetch(`/api/dashboards/${dashboardId}/widgets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgetId, size }),
    });
    if (!response.ok) return;
    setDashboard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        widgets: prev.widgets.map((widget) => (widget.id === widgetId ? { ...widget, size } : widget)),
      };
    });
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
      body: JSON.stringify({ widgetId, ...patch }),
    });
    return response.ok;
  }, [dashboardId]);

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
  }, []);

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
  }, [updateWidget]);

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
  }, [updateWidget]);

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
    const index = CHART_TYPES.indexOf(current.chartType as ChartType);
    const nextChartType = CHART_TYPES[(index + 1) % CHART_TYPES.length];
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

  const handleSaveCurrentAsPreset = () => {
    if (!presetName.trim()) return;
    const firstWithConfig = sortedWidgets[0];
    if (!firstWithConfig) return;
    const cfg = parseWidgetConfig(firstWithConfig.config);
    const nextPreset: VisualPreset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      favorite: false,
      settings: {
        accentColor: String(cfg.accentColor ?? "#2563EB"),
        showLegend: Boolean(cfg.showLegend ?? true),
        showGrid: Boolean(cfg.showGrid ?? true),
        smoothLines: Boolean(cfg.smoothLines ?? true),
        metricFormat: (cfg.metricFormat as VisualPreset["settings"]["metricFormat"]) ?? "number",
      },
    };
    persistPresets([nextPreset, ...savedPresets]);
    setPresetName("");
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

  const togglePresetFavorite = (presetId: string) => {
    persistPresets(savedPresets.map((preset) => (preset.id === presetId ? { ...preset, favorite: !preset.favorite } : preset)));
  };

  const sortedWidgets = useMemo(
    () => [...(dashboard?.widgets ?? [])].sort((a, b) => a.order - b.order),
    [dashboard?.widgets],
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
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-2 h-64 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
          <div className="col-span-2 h-64 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
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
      {error ? (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboards" className="text-[var(--color-text-3)] hover:text-[var(--color-text-1)]">
            <ArrowLeft size={16} />
          </Link>
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
              className="text-2xl font-semibold bg-transparent border-b border-[var(--color-accent)] text-[var(--color-text-1)] focus:outline-none px-1"
              autoFocus
            />
          ) : (
            <h1
              className={cn(
                "text-heading",
                isEditing && "cursor-text hover:text-[var(--color-accent)] transition-colors",
              )}
              onClick={() => isEditing && setEditingName(dashboard.name)}
            >
              {dashboard.name}
            </h1>
          )}
          <Badge variant="neutral">{dashboard.widgets.length} widgets</Badge>
        </div>
        {role === "gestor_centro_control" ? (
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setPresentationMode((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all",
                presentationMode
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-2)]",
              )}
            >
              <Presentation size={14} />
              {presentationMode ? "Salir presentacion" : "Presentacion"}
            </button>
            {isEditing ? (
              <button
                onClick={() => setAddWidgetOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white transition-all hover:bg-[var(--color-accent-hover)]"
              >
                <Plus size={14} />
                Añadir widget
              </button>
            ) : null}
            <button
              onClick={() => {
                setIsEditing((prev) => {
                  if (prev) setFocusedWidgetId(null);
                  return !prev;
                });
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all",
                isEditing
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-2)]",
              )}
            >
              {isEditing ? (
                <>
                  <Check size={14} />
                  Guardar
                </>
              ) : (
                <>
                  <Settings2 size={14} />
                  Editar
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>
      {role === "gestor_centro_control" && isEditing ? (
        <p className="text-[11px] text-[var(--color-text-3)] -mt-2 mb-2">
          Atajos: Ctrl+Z deshacer · Ctrl+Shift+Z o Ctrl+Y rehacer · P presentación · L leyenda (widget en foco) · flechas mover foco · icono descarga PNG en la barra de cada widget (solo en edición).
        </p>
      ) : null}
      {role === "gestor_centro_control" && isEditing && !presentationMode ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-2)]">Preset manager</p>
            <p className="text-[11px] text-[var(--color-text-3)]">Aplicar visual en 1 clic a todos los widgets</p>
          </div>
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
      ) : null}
      {sortedWidgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] py-20 text-center">
          <LayoutDashboard size={48} className="mb-3 text-[var(--color-text-3)]" />
          <p className="text-subheading text-[var(--color-text-2)]">Dashboard vacío</p>
          {role === "gestor_centro_control" ? (
            <>
              <p className="mb-4 mt-1 text-caption">Activa el modo edición para añadir widgets</p>
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white transition-all hover:bg-[var(--color-accent-hover)]"
              >
                <Settings2 size={14} />
                Activar edición
              </button>
            </>
          ) : (
            <p className="mt-1 text-caption">El gestor aún no ha añadido widgets</p>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedWidgets.map((widget) => widget.id)} strategy={rectSortingStrategy}>
            <div className={cn("grid grid-cols-4 gap-4", presentationMode && "gap-3")}>
              {sortedWidgets.map((widget, index) => (
                <SortableWidget key={widget.id} id={widget.id} size={widget.size} isEditing={isEditing}>
                  <WidgetRenderer
                    widget={{ ...widget, chartType: widget.chartType as ChartType }}
                    data={data ?? emptyData}
                    isEditing={isEditing}
                    onRemove={handleRemoveWidget}
                    onResize={handleResizeWidget}
                    onDuplicate={handleDuplicateWidget}
                    onQuickToggleLegend={handleToggleLegendWidget}
                    onQuickCycleChartType={handleCycleChartType}
                    onQuickResetVisual={handleResetVisual}
                    onQuickChangeSource={handleQuickChangeSource}
                    presentationMode={presentationMode}
                    animationDelayMs={Math.min(index * 35, 260)}
                    onRequestEdit={role === "gestor_centro_control" ? () => setIsEditing(true) : undefined}
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
                  />
                </SortableWidget>
              ))}
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
    </div>
  );
}
