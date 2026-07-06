"use client";

import { useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Copy,
  Download,
  HelpCircle,
  Info,
  LayoutGrid,
  Package,
  PackageX,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { AnomalousBusesBanner } from "@/components/inventory/AnomalousBusesBanner";
import { toast } from "@/components/toast-host";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { KpiPill } from "@/components/ui/kpi-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { TableListSkeleton } from "@/components/ui/view-skeletons";
import type { AssetType } from "@/lib/domain";
import { cn } from "@/lib/utils";

import {
  applySort,
  ASSET_TYPE_LABEL_ES,
  buildInventoryCsv,
  coveragePercent,
  filterAdvanced,
  filterBySearch,
  filterByStatus,
  physicalCoveragePercent,
  physicalOnHand,
  rowSummaryForClipboard,
  shortfallUnits,
  slugFromFilters,
  ticketsPathForPartCode,
  type InventoryStatus,
  type InventorySummaryItem,
  type SortKey,
  type StatusFilter,
} from "./inventory-helpers";
import { inv, invTransitionToast } from "./inventory-messages";
import { InventoryListbox } from "./inventory-listbox";
import { InventoryMoreMenu } from "./inventory-more-menu";

const TIP_STORAGE_KEY = "ccmgc_inventory_coverage_tip_v1";
const FILTERS_STORAGE_KEY = "ccmgc_inventory_filters_v3";
/** Snapshot de estados por código (sesión) para detectar OK→Bajo/Agotado al cargar o refrescar completo */
const STATUS_SNAPSHOT_SESSION_KEY = "ccmgc_inventory_status_snapshot_v1";
const CONTROL_ROOM_STORAGE_KEY = "ccmgc_inventory_control_room_v1";
const COV_VISUAL_MAX = 250;
const COV_TICK_PCT = (100 / COV_VISUAL_MAX) * 100;
const ALL_ASSET_TYPES: AssetType[] = ["validadora", "sae", "router", "pantalla"];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded bg-[var(--color-accent)]/25 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export default function InventoryPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<InventorySummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("riesgo");
  const [onlyReserved, setOnlyReserved] = useState(false);
  const [coverageUnder120, setCoverageUnder120] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<AssetType[]>([]);
  const [showTip, setShowTip] = useState(true);
  const [tipExpanded, setTipExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "dense">("cards");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mainTab, setMainTab] = useState<"lista" | "analisis">("lista");
  const [helpOpen, setHelpOpen] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [controlRoom, setControlRoom] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const summaryRef = useRef<InventorySummaryItem[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const controlRoomRef = useRef(false);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  useEffect(() => {
    controlRoomRef.current = controlRoom;
  }, [controlRoom]);

  useEffect(() => {
    try {
      if (localStorage.getItem(CONTROL_ROOM_STORAGE_KEY) === "1") setControlRoom(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CONTROL_ROOM_STORAGE_KEY, controlRoom ? "1" : "0");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("ccmgc-inventory-control-room", { detail: { active: controlRoom } }));
  }, [controlRoom]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent("ccmgc-inventory-control-room", { detail: { active: false } }));
    };
  }, []);

  useEffect(() => {
    try {
      setShowTip(sessionStorage.getItem(TIP_STORAGE_KEY) !== "1");
    } catch {
      setShowTip(true);
    }
    try {
      setAutoRefresh(localStorage.getItem("ccmgc_inventory_autorefresh") === "1");
    } catch {
      setAutoRefresh(false);
    }
    try {
      const d = localStorage.getItem("ccmgc_inventory_dense");
      if (d === "1") setViewMode("dense");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery), 220);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!showTip || !summary.length) return;
    const t = window.setTimeout(() => setTipExpanded(false), 12000);
    return () => clearTimeout(t);
  }, [showTip, summary.length]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (raw) {
        const o = JSON.parse(raw) as Partial<{
          searchQuery: string;
          statusFilter: StatusFilter;
          sortKey: SortKey;
          onlyReserved: boolean;
          coverageUnder120: boolean;
          selectedTypes: AssetType[];
          viewMode: "cards" | "dense";
          mainTab: "lista" | "analisis";
        }>;
        if (typeof o.searchQuery === "string") setSearchQuery(o.searchQuery);
        if (o.statusFilter) setStatusFilter(o.statusFilter);
        if (o.sortKey) setSortKey(o.sortKey);
        if (typeof o.onlyReserved === "boolean") setOnlyReserved(o.onlyReserved);
        if (typeof o.coverageUnder120 === "boolean") setCoverageUnder120(o.coverageUnder120);
        if (Array.isArray(o.selectedTypes)) setSelectedTypes(o.selectedTypes.filter(Boolean) as AssetType[]);
        if (o.viewMode === "dense" || o.viewMode === "cards") setViewMode(o.viewMode);
        if (o.mainTab === "lista" || o.mainTab === "analisis") setMainTab(o.mainTab);
      }
    } catch {
      /* ignore */
    }
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    try {
      localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          searchQuery,
          statusFilter,
          sortKey,
          onlyReserved,
          coverageUnder120,
          selectedTypes,
          viewMode,
          mainTab,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [
    filtersReady,
    searchQuery,
    statusFilter,
    sortKey,
    onlyReserved,
    coverageUnder120,
    selectedTypes,
    viewMode,
    mainTab,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l") && !inField) {
        e.preventDefault();
        setSearchQuery("");
        setStatusFilter("todos");
        setSortKey("riesgo");
        setOnlyReserved(false);
        setCoverageUnder120(false);
        setSelectedTypes([]);
        toast.info(inv.toasts.filtersReset);
        return;
      }
      if (!inField && e.key === "Escape" && controlRoomRef.current) {
        e.preventDefault();
        setControlRoom(false);
        return;
      }
      if (inField) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    const prev = summaryRef.current;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/inventory/summary", { cache: "no-store" });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || inv.errors.fetchBody);
      }
      const data = JSON.parse(text) as { summary: InventorySummaryItem[] };
      const next = data.summary;

      let transitionToast: string | null = null;
      if (silent && prev.length > 0) {
        const prevMap = new Map(prev.map((i) => [i.partCode, i.status]));
        for (const i of next) {
          const was = prevMap.get(i.partCode);
          if (was === "ok" && (i.status === "bajo" || i.status === "agotado")) {
            transitionToast = invTransitionToast(i.partCode, i.status === "bajo" ? "bajo" : "agotado");
            break;
          }
        }
      } else if (!silent) {
        try {
          const raw = sessionStorage.getItem(STATUS_SNAPSHOT_SESSION_KEY);
          if (raw) {
            const snap = JSON.parse(raw) as Record<string, InventoryStatus>;
            if (snap && typeof snap === "object") {
              for (const i of next) {
                const was = snap[i.partCode];
                if (was === "ok" && (i.status === "bajo" || i.status === "agotado")) {
                  transitionToast = invTransitionToast(i.partCode, i.status === "bajo" ? "bajo" : "agotado");
                  break;
                }
              }
            }
          }
        } catch {
          /* ignore */
        }
      }

      try {
        const snap: Record<string, InventoryStatus> = {};
        for (const i of next) snap[i.partCode] = i.status;
        sessionStorage.setItem(STATUS_SNAPSHOT_SESSION_KEY, JSON.stringify(snap));
      } catch {
        /* ignore */
      }

      setSummary(next);
      setLastLoadedAt(new Date());
      if (silent) {
        if (transitionToast) {
          toast.warning(transitionToast);
        } else {
          toast.info(inv.toasts.inventoryUpdated);
        }
      } else if (transitionToast) {
        toast.warning(transitionToast);
      }
    } catch (loadError) {
      console.error(loadError);
      setError(inv.errors.loadFailed);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void load({ silent: true }), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const dismissTip = () => {
    try {
      sessionStorage.setItem(TIP_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowTip(false);
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh((v) => {
      const n = !v;
      try {
        localStorage.setItem("ccmgc_inventory_autorefresh", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  const toggleDense = () => {
    setViewMode((m) => {
      const n = m === "cards" ? "dense" : "cards";
      try {
        localStorage.setItem("ccmgc_inventory_dense", n === "dense" ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  const toggleAssetType = (t: AssetType) => {
    setSelectedTypes((prev) => {
      if (prev.length === 0) return [t];
      if (prev.includes(t)) {
        const n = prev.filter((x) => x !== t);
        return n;
      }
      return [...prev, t];
    });
  };

  const totalItems = summary.length;
  const itemsBajos = summary.filter((i) => i.status === "bajo").length;
  const itemsAgotados = summary.filter((i) => i.status === "agotado").length;

  const filteredSorted = useMemo(() => {
    let list = summary.slice();
    list = filterByStatus(list, statusFilter);
    list = filterBySearch(list, debouncedQuery);
    list = filterAdvanced(list, {
      onlyReserved,
      coverageUnder120,
      assetTypes: selectedTypes,
    });
    list = applySort(list, sortKey);
    return list;
  }, [summary, statusFilter, debouncedQuery, onlyReserved, coverageUnder120, selectedTypes, sortKey]);

  const handleExportCsv = () => {
    const slug = slugFromFilters([
      statusFilter,
      sortKey,
      onlyReserved ? "res" : "",
      coverageUnder120 ? "cov120" : "",
      selectedTypes.join("-"),
      debouncedQuery.trim().slice(0, 24),
    ]);
    const csv = buildInventoryCsv(filteredSorted, { spanishHeaders: true, delimiter: ";" });
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 19);
    anchor.href = url;
    anchor.download = `inventario_ccmgc_${slug}_${stamp}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportOneRow = (item: InventorySummaryItem) => {
    const csv = buildInventoryCsv([item], { spanishHeaders: true, delimiter: ";" });
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `inventario_fila_${item.partCode.replace(/[^\w-]+/g, "")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyPartCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1600);
      toast.info(inv.toasts.codeCopied);
    } catch {
      toast.error(inv.toasts.codeCopyErr);
    }
  };

  const copySummary = async (item: InventorySummaryItem) => {
    try {
      await navigator.clipboard.writeText(rowSummaryForClipboard(item));
      toast.info(inv.toasts.summaryCopied);
    } catch {
      toast.error(inv.toasts.summaryCopyErr);
    }
  };

  let tzLabel = "hora local";
  try {
    tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "hora local";
  } catch {
    /* ignore */
  }

  const heatmapRows = useMemo(() => {
    return ALL_ASSET_TYPES.map((t) => ({
      type: t,
      label: ASSET_TYPE_LABEL_ES[t],
      ok: summary.filter((i) => i.assetType === t && i.status === "ok").length,
      bajo: summary.filter((i) => i.assetType === t && i.status === "bajo").length,
      agotado: summary.filter((i) => i.assetType === t && i.status === "agotado").length,
    }));
  }, [summary]);

  if (loading) {
    return (
      <div className="inventory-print-root space-y-6" aria-busy="true" aria-label={inv.a11y.loadingRoot}>
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-16 w-full max-w-3xl rounded-lg" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <TableListSkeleton rows={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="inventory-print-root py-12">
        <ErrorState
          icon={AlertCircle}
          title={error}
          hint="Comprueba la conexión e inténtalo de nuevo."
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const relativeLoaded =
    lastLoadedAt != null
      ? new Intl.RelativeTimeFormat("es", { numeric: "auto" }).format(
          -Math.max(0, Math.round((Date.now() - lastLoadedAt.getTime()) / 60000)),
          "minute",
        )
      : null;

  const statusOptions = [
    { value: "todos", label: "Todos" },
    { value: "alertas", label: "Solo alertas (bajo o agotado)" },
    { value: "ok", label: "OK" },
    { value: "bajo", label: "Bajo" },
    { value: "agotado", label: "Agotado" },
  ];

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: "riesgo", label: "Riesgo (predeterminado)" },
    { value: "nombre", label: "Nombre A→Z" },
    { value: "codigo", label: "Código A→Z" },
    { value: "cobertura", label: "Cobertura % (menor primero)" },
    { value: "fisico", label: "Físico en almacén" },
    { value: "reservado", label: "Reservado (menor primero)" },
  ];

  return (
      <div className={cn("inventory-print-root space-y-6", controlRoom && "max-w-none")}>
      <AnomalousBusesBanner />

      <header className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-6 print:border-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <div className="min-w-0 flex-1">
              <div className="ccmgc-eyebrow dashboard-pretitle mb-1">
                <span className="ccmgc-eyebrow-dot ccmgc-eyebrow-dot--pulse dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
                CCMGC · Operación
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-heading">{inv.header.title}</h1>
                <FeedbackTargetButton id="inventario/lista" label="Listado de inventario de repuestos" />
                <div className="relative print:hidden">
                  <button
                    type="button"
                    className="rounded-full border border-[var(--color-border)] p-1.5 text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    aria-expanded={helpOpen}
                    aria-controls="inventory-help-panel"
                    onClick={() => setHelpOpen((v) => !v)}
                    title={inv.a11y.helpToggle}
                  >
                    <HelpCircle size={16} aria-hidden />
                  </button>
                  {helpOpen ? (
                    <div
                      id="inventory-help-panel"
                      role="tooltip"
                      className="absolute left-0 top-full z-50 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left text-[11px] leading-relaxed text-[var(--color-text-2)] shadow-lg"
                    >
                      <p className="font-medium text-[var(--color-text-1)]">{inv.help.shortcuts}</p>
                      <ul className="mt-1 list-inside list-disc space-y-1">
                        <li>
                          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1 font-mono">/</kbd> {inv.help.searchKey}
                        </li>
                        <li>
                          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1 font-mono">Ctrl+Shift+L</kbd>{" "}
                          {inv.help.clearFiltersKey}
                        </li>
                        <li>
                          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1 font-mono">Escape</kbd>{" "}
                          {inv.help.escapeControlRoom}
                        </li>
                      </ul>
                      <button
                        type="button"
                        className="mt-2 block w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-left font-medium text-[var(--color-text-1)] hover:bg-[var(--color-surface)]"
                        onClick={() => {
                          try {
                            localStorage.removeItem(FILTERS_STORAGE_KEY);
                          } catch {
                            /* ignore */
                          }
                          setSearchQuery("");
                          setDebouncedQuery("");
                          setStatusFilter("todos");
                          setSortKey("riesgo");
                          setOnlyReserved(false);
                          setCoverageUnder120(false);
                          setSelectedTypes([]);
                          toast.info(inv.toasts.filtersMemoryCleared);
                          setHelpOpen(false);
                        }}
                      >
                        {inv.help.clearMemory}
                      </button>
                      <button
                        type="button"
                        className="mt-2 text-[var(--color-accent)] underline"
                        onClick={() => setHelpOpen(false)}
                      >
                        {inv.help.close}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="mt-1 text-body text-[var(--color-text-2)]">{inv.header.subtitle}</p>
              {lastLoadedAt ? (
                <p className="mt-2 text-[11px] text-[var(--color-text-2)]">
                  Datos actualizados {lastLoadedAt.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "medium" })}{" "}
                  ({relativeLoaded}) · {tzLabel}
                  <span
                    className="ml-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-2)]"
                    title={inv.header.cacheBadgeTitle}
                  >
                    {inv.header.cacheBadge}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 print:hidden">
            <Button
              type="button"
              variant={autoRefresh ? "primary" : "secondary"}
              size="sm"
              onClick={toggleAutoRefresh}
              className="gap-1.5"
              title="Actualiza cada 5 minutos en segundo plano"
            >
              Auto 5 min
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={toggleDense} className="gap-1.5">
              {viewMode === "dense" ? "Tarjetas" : "Vista densa"}
            </Button>
            <Button
              type="button"
              variant={controlRoom ? "primary" : "secondary"}
              size="sm"
              className="gap-1.5"
              title={controlRoom ? inv.controlRoom.titleOn : inv.controlRoom.titleOff}
              aria-pressed={controlRoom}
              onClick={() => setControlRoom((v) => !v)}
            >
              <LayoutGrid size={14} aria-hidden />
              {controlRoom ? inv.controlRoom.exit : inv.controlRoom.enter}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={refreshing}
              onClick={() => void load({ silent: true })}
              className="gap-1.5"
            >
              <RefreshCw size={14} className={cn(refreshing && !reduceMotion && "animate-spin")} aria-hidden />
              Refrescar
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={filteredSorted.length === 0}
              onClick={handleExportCsv}
              className="gap-1.5"
            >
              <Download size={14} aria-hidden />
              CSV
            </Button>
          </div>
        </div>

        {showTip && summary.length > 0 ? (
          tipExpanded ? (
            <div className="flex gap-2 rounded-lg border border-[var(--color-accent)]/25 bg-[var(--color-accent-light)]/40 px-3 py-2.5 text-[11px] leading-relaxed text-[var(--color-text-2)] print:hidden">
              <Info size={16} className="mt-0.5 shrink-0 text-[var(--color-accent)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <span className="font-medium text-[var(--color-text-1)]">{inv.tip.title}</span> {inv.tip.body}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setTipExpanded(false)}
                  className="rounded px-2 py-1 text-[11px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface-2)]"
                >
                  {inv.tip.hide}
                </button>
                <button
                  type="button"
                  onClick={dismissTip}
                  className="rounded p-1 text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
                  aria-label={inv.a11y.dismissTipForever}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 px-3 py-2 text-[11px] text-[var(--color-text-2)] print:hidden">
              <span className="min-w-0">{inv.tip.collapsed}</span>
              <button
                type="button"
                className="shrink-0 font-medium text-[var(--color-accent)] hover:underline"
                onClick={() => setTipExpanded(true)}
              >
                {inv.tip.show}
              </button>
            </div>
          )
        ) : null}

        <div className="flex flex-col gap-3 print:hidden">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-2">
            <div className="relative min-h-[44px] min-w-0 flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--color-text-3)]"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchQuery("");
                    e.currentTarget.blur();
                  }
                }}
                placeholder={inv.search.placeholder}
                className="h-full min-h-[44px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] py-2 pl-10 pr-3 text-sm text-[var(--color-text-1)] placeholder:text-[var(--color-text-2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]"
                aria-label={inv.a11y.searchInput}
              />
            </div>
            <InventoryListbox
              className="w-full min-w-[11rem] shrink-0 lg:w-52"
              label="Estado"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={statusOptions}
            />
            <InventoryListbox
              className="w-full min-w-[11rem] shrink-0 lg:w-56"
              label="Orden"
              value={sortKey}
              onChange={(v) => setSortKey(v as SortKey)}
              options={sortOptions}
            />
          </div>
          <div className="flex md:hidden">
            <Button type="button" variant="secondary" size="sm" onClick={() => setFiltersOpen((v) => !v)}>
              {filtersOpen ? inv.filters.advancedOpen : inv.filters.advancedClosed}
            </Button>
          </div>
          <div
            className={cn(
              "flex flex-col gap-2 rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-surface-2)]/40 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2",
              filtersOpen ? "flex" : "hidden",
              "md:flex",
            )}
          >
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--color-text-2)]">
              <input
                type="checkbox"
                checked={onlyReserved}
                onChange={(e) => setOnlyReserved(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              />
              {inv.filters.onlyReserved}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--color-text-2)]">
              <input
                type="checkbox"
                checked={coverageUnder120}
                onChange={(e) => setCoverageUnder120(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              />
              {inv.filters.coverage120}
            </label>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="w-full text-[11px] font-medium text-[var(--color-text-2)] sm:w-auto sm:pr-1">
                {inv.filters.assetTypeLabel}
              </span>
              {ALL_ASSET_TYPES.map((t) => {
                const active = selectedTypes.length === 0 ? false : selectedTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleAssetType(t)}
                    title={selectedTypes.length === 0 ? "Pulsa para filtrar por este tipo" : "Alternar tipo"}
                    className={cn(
                      "filter-chip",
                      active && "filter-chip--active",
                    )}
                  >
                    {ASSET_TYPE_LABEL_ES[t]}
                  </button>
                );
              })}
              {selectedTypes.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedTypes([])}
                  className="text-[11px] font-medium text-[var(--color-accent)] underline-offset-2 hover:underline"
                >
                  {inv.filters.clearTypes}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div
        role="region"
        aria-label={inv.a11y.dataRegion}
        aria-busy={refreshing}
        className="flex flex-col gap-6"
      >
      <section aria-labelledby="inventory-kpi-heading" className="print:hidden">
        <h2 id="inventory-kpi-heading" className="sr-only">
          {inv.a11y.kpiHeading}
        </h2>
        {/* KPIs compactos: una sola fila horizontal con dividers internos.
         *  Cada KPI es clicable y filtra la tabla. Ahorra ~120px verticales
         *  respecto a las cards XL anteriores. */}
        <div className="ccmgc-card flex flex-wrap gap-2 p-3">
          <KpiPill
            label="Total referencias"
            value={totalItems}
            tone="neutral"
            icon={<Package size={12} strokeWidth={1.5} aria-hidden />}
            onClick={() => {
              setStatusFilter("todos");
              setSortKey("riesgo");
            }}
            title={inv.kpi.totalHint}
          />
          <KpiPill
            label="Stock bajo"
            value={itemsBajos}
            tone="warning"
            icon={<AlertTriangle size={12} strokeWidth={1.5} aria-hidden />}
            onClick={() => setStatusFilter("bajo")}
            title={inv.kpi.bajoHint}
          />
          <KpiPill
            label="Agotados"
            value={itemsAgotados}
            tone="error"
            icon={<PackageX size={12} strokeWidth={1.5} aria-hidden />}
            onClick={() => setStatusFilter("agotado")}
            title={inv.kpi.agotadoHint}
          />
        </div>
      </section>

      {summary.length > 0 ? (
        <div className="mb-3 flex flex-col gap-2 border-b border-[var(--color-border)] pb-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label={inv.a11y.tablist}
            className="inline-flex gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "lista"}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                mainTab === "lista"
                  ? "bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-sm"
                  : "text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
              )}
              onClick={() => setMainTab("lista")}
            >
              {inv.tabs.lista}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === "analisis"}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                mainTab === "analisis"
                  ? "bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-sm"
                  : "text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
              )}
              onClick={() => setMainTab("analisis")}
            >
              {inv.tabs.analisis}
            </button>
          </div>
          <p className="text-[12px] leading-snug text-[var(--color-text-2)]">
            {mainTab === "lista" ? (
              <>
                Mostrando <span className="font-medium text-[var(--color-text-1)]">{filteredSorted.length}</span> de{" "}
                {totalItems} referencias · orden: {sortOptions.find((o) => o.value === sortKey)?.label}
                {debouncedQuery.trim() ? ` · búsqueda: “${debouncedQuery.trim()}”` : ""}
              </>
            ) : (
              <>
                Mapa tipo × estado · {heatmapRows.reduce((a, r) => a + r.ok + r.bajo + r.agotado, 0)} celdas de
                catálogo
              </>
            )}
          </p>
        </div>
      ) : null}

      {summary.length === 0 ? (
        <EmptyState
          icon={Package}
          title={inv.emptyCatalog.title}
          hint={inv.emptyCatalog.body}
        />
      ) : (
        <>
          {mainTab === "analisis" ? (
            <section className="print:hidden" aria-label={inv.a11y.heatmapSection}>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                <table className="ccmgc-table w-full min-w-[280px] text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                      <th className="p-2 font-medium text-[var(--color-text-2)]">Tipo</th>
                      <th className="p-2 text-right font-medium text-[var(--color-success)]">OK</th>
                      <th className="p-2 text-right font-medium text-[var(--color-warning)]">Bajo</th>
                      <th className="p-2 text-right font-medium text-[var(--color-error)]">Agotado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapRows.map((r) => (
                      <tr
                        key={r.type}
                        className={cn(
                          "border-b border-[var(--color-border)]/60",
                          !reduceMotion &&
                            "motion-safe:transition-colors motion-safe:duration-300 hover:bg-[var(--color-surface-2)]/50",
                        )}
                      >
                        <td className="p-2 text-[var(--color-text-1)]">{r.label}</td>
                        <td className="p-2 text-right tabular-nums">{r.ok}</td>
                        <td className="p-2 text-right tabular-nums">{r.bajo}</td>
                        <td className="p-2 text-right tabular-nums">{r.agotado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {mainTab === "lista" ? (
            viewMode === "dense" ? (
            <section aria-labelledby="inventory-list-heading" className="relative print:hidden">
              <h2 id="inventory-list-heading" className="sr-only">
                {inv.a11y.listHeading}
              </h2>
              <div className={cn("relative", refreshing && "pointer-events-none opacity-60")}>
                {refreshing ? (
                  <div
                    className="absolute inset-0 z-10 flex items-start justify-end pt-2 pr-2 print:hidden"
                    aria-hidden
                  >
                    <RefreshCw size={18} className={cn("text-[var(--color-accent)]", !reduceMotion && "animate-spin")} />
                  </div>
                ) : null}
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                <table className="ccmgc-table w-full min-w-[900px] text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                      <th scope="col" className="p-2.5 text-[var(--color-text-2)]">
                        <button
                          type="button"
                          className="rounded px-1 py-0.5 text-left font-medium hover:bg-[var(--color-surface)]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                          title={sortKey === "codigo" ? "Orden activo" : "Ordenar por código"}
                          onClick={() => setSortKey("codigo")}
                        >
                          Código{sortKey === "codigo" ? " ·" : ""}
                        </button>
                      </th>
                      <th scope="col" className="p-2.5 text-[var(--color-text-2)]">
                        <button
                          type="button"
                          className="rounded px-1 py-0.5 text-left font-medium hover:bg-[var(--color-surface)]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                          title={sortKey === "nombre" ? "Orden activo" : "Ordenar por nombre"}
                          onClick={() => setSortKey("nombre")}
                        >
                          Nombre{sortKey === "nombre" ? " ·" : ""}
                        </button>
                      </th>
                      <th scope="col" className="p-2.5 font-medium text-[var(--color-text-2)]">Tipo</th>
                      <th scope="col" className="p-2.5 text-right text-[var(--color-text-2)]">
                        <button
                          type="button"
                          className="inline-flex rounded px-1 py-0.5 font-medium hover:bg-[var(--color-surface)]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                          title={sortKey === "fisico" ? "Orden activo" : "Ordenar por unidades físicas"}
                          onClick={() => setSortKey("fisico")}
                        >
                          Fís.{sortKey === "fisico" ? " ·" : ""}
                        </button>
                      </th>
                      <th scope="col" className="p-2.5 text-right font-medium text-[var(--color-text-2)]">Disp.</th>
                      <th scope="col" className="p-2.5 text-right text-[var(--color-text-2)]">
                        <button
                          type="button"
                          className="inline-flex rounded px-1 py-0.5 font-medium hover:bg-[var(--color-surface)]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                          title={sortKey === "reservado" ? "Orden activo" : "Ordenar por reservado"}
                          onClick={() => setSortKey("reservado")}
                        >
                          Res.{sortKey === "reservado" ? " ·" : ""}
                        </button>
                      </th>
                      <th scope="col" className="p-2.5 text-right font-medium text-[var(--color-text-2)]">Mín.</th>
                      <th scope="col" className="p-2.5 text-right text-[var(--color-text-2)]">
                        <button
                          type="button"
                          className="inline-flex rounded px-1 py-0.5 font-medium hover:bg-[var(--color-surface)]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                          title={sortKey === "cobertura" ? "Orden activo" : "Ordenar por cobertura %"}
                          onClick={() => setSortKey("cobertura")}
                        >
                          Cov.{sortKey === "cobertura" ? " ·" : ""}
                        </button>
                      </th>
                      <th scope="col" className="p-2.5 text-[var(--color-text-2)]">
                        <button
                          type="button"
                          className="rounded px-1 py-0.5 text-left font-medium hover:bg-[var(--color-surface)]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                          title={sortKey === "riesgo" ? "Orden activo (riesgo)" : "Ordenar por riesgo / estado"}
                          onClick={() => setSortKey("riesgo")}
                        >
                          Estado{sortKey === "riesgo" ? " ·" : ""}
                        </button>
                      </th>
                      <th scope="col" className="p-2.5 font-medium text-[var(--color-text-2)]">Tickets</th>
                      <th scope="col" className="p-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSorted.map((item, rowIdx) => {
                      const cov = coveragePercent(item);
                      const onHand = physicalOnHand(item);
                      const st = item.status === "agotado" ? "Agotado" : item.status === "bajo" ? "Bajo" : "OK";
                      const tPath = ticketsPathForPartCode(item.partCode);
                      return (
                        <tr
                          key={item.partCode}
                          className={cn(
                            "border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface-2)]/60",
                            rowIdx % 2 === 1 && "bg-[var(--color-surface-2)]/25",
                          )}
                        >
                          <td className="p-2.5 font-mono text-[12px] text-[var(--color-text-2)]">{item.partCode}</td>
                          <td className="p-2.5 text-[var(--color-text-1)]">{item.partName}</td>
                          <td className="p-2.5 text-[var(--color-text-2)]">{ASSET_TYPE_LABEL_ES[item.assetType]}</td>
                          <td className="p-2.5 text-right tabular-nums text-[var(--color-text-2)]">{onHand}</td>
                          <td className="p-2.5 text-right tabular-nums">{item.totalAvailable}</td>
                          <td className="p-2.5 text-right tabular-nums">{item.totalReserved}</td>
                          <td className="p-2.5 text-right tabular-nums">{item.minimumLevel}</td>
                          <td className="p-2.5 text-right tabular-nums">{cov}%</td>
                          <td className="p-2.5">{st}</td>
                          <td className="p-2.5">
                            <Link
                              href={tPath}
                              onMouseEnter={() => router.prefetch(tPath)}
                              className="text-[12px] font-medium text-[var(--color-accent)] underline-offset-2 hover:underline"
                            >
                              {inv.dense.ticketsLink(item.ticketCount)}
                            </Link>
                          </td>
                          <td className="p-2.5">
                            <Button type="button" variant="ghost" size="sm" className="min-h-0 px-2 py-1" onClick={() => exportOneRow(item)}>
                              CSV
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            </section>
          ) : (
            <section aria-labelledby="inventory-list-heading">
              <h2 id="inventory-list-heading" className="sr-only">
                {inv.a11y.listHeading}
              </h2>
              <div className={cn("relative", refreshing && "pointer-events-none opacity-60")}>
                {refreshing ? (
                  <div
                    className="absolute inset-0 z-10 flex items-start justify-end pt-2 pr-2 print:hidden"
                    aria-hidden
                  >
                    <RefreshCw size={18} className={cn("text-[var(--color-accent)]", !reduceMotion && "animate-spin")} />
                  </div>
                ) : null}
              <ul
                className={cn(
                  "mx-auto grid list-none print:hidden min-h-[12rem] motion-reduce:transition-none",
                  controlRoom
                    ? "max-w-none w-full grid-cols-1 gap-3 p-0 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
                    : "max-w-6xl grid-cols-1 gap-4 p-0 md:grid-cols-2 xl:grid-cols-4",
                )}
              >
                {filteredSorted.map((item, index) => {
                  const isAgotado = item.status === "agotado";
                  const isBajo = item.status === "bajo";
                  const cov = coveragePercent(item);
                  const onHand = physicalOnHand(item);
                  const reservedRatio =
                    onHand > 0 ? Math.min(100, Math.round((item.totalReserved / onHand) * 1000) / 10) : 0;
                  const freeRatio = onHand > 0 ? Math.round((100 - reservedRatio) * 10) / 10 : 0;
                  const showPing = isAgotado && !reduceMotion && index < 4;
                  const minMarkerPct = onHand > 0 ? Math.min(100, (item.minimumLevel / onHand) * 100) : 0;
                  const covBarW = Math.min(100, (cov / COV_VISUAL_MAX) * 100);
                  const deficit = shortfallUnits(item);
                  const physCov = physicalCoveragePercent(item);
                  const minAbovePhys = item.minimumLevel > onHand && item.minimumLevel > 0;

                  return (
                    <li key={item.partCode}>
                      <article
                        className={cn(
                          "relative flex h-full cursor-default flex-col rounded-xl border bg-[var(--color-surface)] p-4 shadow-sm outline-none transition-[border-color,box-shadow] duration-200 focus-within:ring-2 focus-within:ring-[var(--color-accent)] sm:p-5 print:break-inside-avoid motion-reduce:transition-none",
                          isAgotado
                            ? "border-[var(--color-error)] ring-1 ring-[var(--color-error)]/30"
                            : isBajo
                              ? "border-[var(--color-warning)]"
                              : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:shadow-md",
                        )}
                      >
                        {showPing ? (
                          <span
                            className="ccmgc-pulse-dot absolute right-10 top-4 h-2.5 w-2.5 rounded-full bg-[var(--color-error)]"
                            aria-hidden
                          />
                        ) : isAgotado ? (
                          <span
                            className="absolute right-10 top-4 h-2.5 w-2.5 rounded-full bg-[var(--color-error)]"
                            aria-hidden
                          />
                        ) : null}

                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <Badge variant={isAgotado ? "error" : isBajo ? "warning" : "success"} className="text-[11px]">
                            {isAgotado ? "Agotado" : isBajo ? "Bajo" : "OK"}
                          </Badge>
                          <Badge
                            variant="neutral"
                            className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-2)]"
                            title={ASSET_TYPE_LABEL_ES[item.assetType]}
                          >
                            {item.assetType}
                          </Badge>
                        </div>

                        <div className="mb-3 flex flex-wrap items-start gap-2">
                          <p className="min-w-0 flex-1 text-sm leading-snug text-[var(--color-text-1)]">
                            <span className="font-mono text-[12px] text-[var(--color-text-2)]">
                              <HighlightMatch text={item.partCode} query={searchQuery} />
                            </span>
                            <span className="mx-1.5 text-[var(--color-text-3)]">·</span>
                            <span className="font-semibold">
                              <HighlightMatch text={item.partName} query={searchQuery} />
                            </span>
                          </p>
                          <button
                            type="button"
                            onClick={() => void copyPartCode(item.partCode)}
                            className={cn(
                              "shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1.5 text-[var(--color-text-2)] transition-colors hover:border-[var(--color-accent)]/40 hover:text-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                              copiedCode === item.partCode && "ccmgc-copy-feedback--ok",
                            )}
                            title={inv.card.copyCodeTitle}
                            aria-label={inv.card.copyCodeAria(item.partCode)}
                          >
                            <Copy size={14} aria-hidden />
                          </button>
                        </div>

                        <div
                          className="mb-3 mt-3 grid grid-cols-3 gap-x-1 gap-y-2 text-center tabular-nums sm:gap-2"
                          aria-label={inv.a11y.stockQuantities}
                        >
                          <div title="Unidades libres para nuevas reservas (excluye lo ya reservado en tickets).">
                            <p className="text-lg font-semibold tabular-nums text-[var(--color-text-1)] sm:text-xl">
                              {item.totalAvailable}
                            </p>
                            <p className="text-[11px] font-medium leading-tight text-[var(--color-text-2)] sm:text-caption">
                              Disponible
                            </p>
                          </div>
                          <div title="Comprometido en reservas (p. ej. tickets con repuesto asignado).">
                            <p className="text-lg font-semibold tabular-nums text-[var(--color-text-2)] sm:text-xl">
                              {item.totalReserved}
                            </p>
                            <p className="text-[11px] font-medium leading-tight text-[var(--color-text-2)] sm:text-caption">
                              Reservado
                            </p>
                          </div>
                          <div title="Umbral de alerta configurado para esta referencia.">
                            <p className="text-lg font-semibold tabular-nums text-[var(--color-text-3)] sm:text-xl">
                              {item.minimumLevel}
                            </p>
                            <p className="text-[11px] font-medium leading-tight text-[var(--color-text-2)] sm:text-caption">
                              Mínimo
                            </p>
                          </div>
                        </div>

                        <p className="mb-1.5 text-[11px] text-[var(--color-text-2)]">
                          {inv.card.physLine(onHand, freeRatio, reservedRatio)}
                        </p>

                        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-2)]">
                          <Package size={14} className="shrink-0 text-[var(--color-text-3)]" aria-hidden />
                          <span id={`inv-phys-bar-${item.partCode}`}>{inv.card.physBarLabel}</span>
                        </div>
                        <div
                          className={cn(
                            "rounded-full p-px",
                            isBajo && "bg-[var(--color-warning)]/10 ring-1 ring-[var(--color-warning)]/35",
                            isAgotado && "bg-[var(--color-error)]/10 ring-1 ring-[var(--color-error)]/40",
                          )}
                          aria-describedby={`inv-phys-bar-${item.partCode}`}
                        >
                          <div className="relative mb-1 h-2 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                            {onHand > 0 ? (
                              <div className="flex h-full w-full">
                                <div
                                  className="h-full shrink-0 bg-[var(--color-warning)]/75"
                                  style={{ width: `${reservedRatio}%` }}
                                />
                                <div
                                  className={cn(
                                    "h-full shrink-0",
                                    isAgotado
                                      ? "bg-[var(--color-surface-3)]"
                                      : isBajo
                                        ? "bg-[var(--color-warning)]/45"
                                        : "bg-[var(--color-success)]",
                                  )}
                                  style={{ width: `${freeRatio}%` }}
                                />
                              </div>
                            ) : (
                              <div className="h-full w-full bg-[var(--color-surface-3)]" />
                            )}
                            {onHand > 0 && item.minimumLevel > 0 ? (
                              <span
                                className={cn(
                                  "pointer-events-none absolute bottom-0 top-0 w-px",
                                  minAbovePhys ? "bg-[var(--color-error)]" : "bg-[var(--color-text-1)]/75",
                                )}
                                style={{ left: `calc(${minMarkerPct}% - 0.5px)` }}
                                title={minAbovePhys ? inv.card.minMarkerAbove : inv.card.minMarkerOk}
                              />
                            ) : null}
                          </div>
                        </div>
                        {minAbovePhys ? (
                          <p className="mb-1 text-[11px] font-medium text-[var(--color-error)]">{inv.card.minAbovePhys}</p>
                        ) : null}
                        {(isBajo || isAgotado) && item.totalReserved === 0 && onHand > 0 ? (
                          <p className="mb-2 text-[11px] leading-snug text-[var(--color-text-2)]">{inv.card.freeAllPhysical}</p>
                        ) : null}

                        <p
                          className="mb-1 text-[11px] text-[var(--color-text-2)]"
                          title={inv.card.physMinTitle}
                        >
                          {inv.card.physMinLine(physCov)}
                        </p>

                        <div className="mt-2">
                          <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-2)]">
                            <BarChart3 size={14} className="shrink-0 text-[var(--color-text-3)]" aria-hidden />
                            <span id={`inv-cov-bar-${item.partCode}`}>{inv.card.coverageBarLabel(COV_VISUAL_MAX)}</span>
                          </div>
                          <div
                            className="relative h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]"
                            aria-describedby={`inv-cov-bar-${item.partCode}`}
                          >
                            <div
                              className={cn(
                                "h-full rounded-full",
                                cov < 100 ? "bg-[var(--color-error)]" : cov === 100 ? "bg-[var(--color-warning)]" : "bg-[var(--color-success)]",
                              )}
                              style={{ width: `${covBarW}%` }}
                            />
                            <span
                              className="pointer-events-none absolute bottom-0 top-0 w-px bg-[var(--color-text-1)]/90"
                              style={{ left: `${COV_TICK_PCT}%` }}
                              title={inv.card.covTickTitle}
                            />
                          </div>
                        </div>

                        <p className="mb-3 mt-2 text-right text-[11px] font-medium text-[var(--color-text-2)]">
                          {inv.card.covLabel}{" "}
                          <span
                            className={cn(
                              "tabular-nums",
                              cov < 100
                                ? "text-[var(--color-error)]"
                                : cov === 100
                                  ? "text-[var(--color-warning)]"
                                  : "text-[var(--color-success)]",
                            )}
                          >
                            {cov}%
                          </span>
                          {cov > 100 ? (
                            <span className="mt-0.5 block text-[11px] font-normal text-[var(--color-text-2)]">
                              {inv.card.excess(item.totalAvailable - item.minimumLevel)}
                            </span>
                          ) : deficit > 0 ? (
                            <span className="mt-0.5 block text-[11px] font-normal text-[var(--color-error)]">
                              {inv.card.deficit(deficit)}
                            </span>
                          ) : null}
                        </p>

                        <div className="mt-auto flex flex-col gap-3 border-t border-[var(--color-border)] pt-3 print:hidden">
                          <Link
                            href={ticketsPathForPartCode(item.partCode)}
                            onMouseEnter={() => router.prefetch(ticketsPathForPartCode(item.partCode))}
                            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-transparent bg-[var(--color-accent)] px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] sm:min-h-0"
                            title={inv.card.ticketsFilteredTitle}
                          >
                            {typeof item.ticketCount === "number"
                              ? inv.card.ticketsWithCount(item.ticketCount)
                              : inv.card.ticketsNoCount}
                          </Link>
                          <Link
                            href="/bandeja"
                            className="block text-center text-[13px] font-medium text-[var(--color-text-2)] underline-offset-2 hover:text-[var(--color-text-1)] hover:underline sm:text-left"
                          >
                            {inv.card.bandejaGeneral}
                          </Link>
                          <div className="flex justify-end border-t border-[var(--color-border)]/60 pt-2">
                            <InventoryMoreMenu
                              partCode={item.partCode}
                              onCopySummary={() => void copySummary(item)}
                              onExportCsv={() => exportOneRow(item)}
                            />
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
              </div>
            </section>
          )
          ) : null}

          {filteredSorted.length > 0 ? (
            <div className="hidden print:block print:max-w-none">
              <p className="mb-2 text-[11px] text-slate-700">
                {inv.print.intro({
                  stamp: lastLoadedAt ? lastLoadedAt.toLocaleString("es-ES") : "",
                  total: totalItems,
                  bajos: itemsBajos,
                  agotados: itemsAgotados,
                  rows: filteredSorted.length,
                  filtered: filteredSorted.length !== totalItems,
                })}
              </p>
              <table className="w-full border-collapse border border-slate-400 text-[9px] text-slate-900">
                <thead>
                  <tr className="border-b border-slate-400 bg-slate-100">
                    <th className="border border-slate-300 px-1 py-0.5 text-left font-semibold">Código</th>
                    <th className="border border-slate-300 px-1 py-0.5 text-left font-semibold">Nombre</th>
                    <th className="border border-slate-300 px-1 py-0.5 text-left font-semibold">Tipo</th>
                    <th className="border border-slate-300 px-1 py-0.5 text-right font-semibold">Fís.</th>
                    <th className="border border-slate-300 px-1 py-0.5 text-right font-semibold">Disp.</th>
                    <th className="border border-slate-300 px-1 py-0.5 text-right font-semibold">Res.</th>
                    <th className="border border-slate-300 px-1 py-0.5 text-right font-semibold">Mín.</th>
                    <th className="border border-slate-300 px-1 py-0.5 text-right font-semibold">Cov.%</th>
                    <th className="border border-slate-300 px-1 py-0.5 text-left font-semibold">Estado</th>
                    <th className="border border-slate-300 px-1 py-0.5 text-left font-semibold">URL tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((item) => {
                    const cov = coveragePercent(item);
                    const stLabel = item.status === "agotado" ? "Agotado" : item.status === "bajo" ? "Bajo" : "OK";
                    const onHand = physicalOnHand(item);
                    const rel = ticketsPathForPartCode(item.partCode);
                    const ticketUrl =
                      typeof globalThis !== "undefined" && "location" in globalThis && globalThis.location?.origin
                        ? `${globalThis.location.origin}${rel}`
                        : rel;
                    return (
                      <tr key={`print-${item.partCode}`} className="odd:bg-white even:bg-slate-50">
                        <td className="border border-slate-200 px-1 py-0.5 font-mono">{item.partCode}</td>
                        <td className="border border-slate-200 px-1 py-0.5">{item.partName}</td>
                        <td className="border border-slate-200 px-1 py-0.5">{item.assetType}</td>
                        <td className="border border-slate-200 px-1 py-0.5 text-right tabular-nums">{onHand}</td>
                        <td className="border border-slate-200 px-1 py-0.5 text-right tabular-nums">{item.totalAvailable}</td>
                        <td className="border border-slate-200 px-1 py-0.5 text-right tabular-nums">{item.totalReserved}</td>
                        <td className="border border-slate-200 px-1 py-0.5 text-right tabular-nums">{item.minimumLevel}</td>
                        <td className="border border-slate-200 px-1 py-0.5 text-right tabular-nums">{cov}</td>
                        <td className="border border-slate-200 px-1 py-0.5">{stLabel}</td>
                        <td className="break-all border border-slate-200 px-1 py-0.5 font-mono text-[9px]">{ticketUrl}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {filteredSorted.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] py-12 text-center print:hidden">
              <p className="text-sm text-[var(--color-text-2)]">{inv.emptyFilter.title}</p>
              <p className="mt-1 text-[12px] text-[var(--color-text-2)]">{inv.emptyFilter.body}</p>
              <button
                type="button"
                className="mt-3 text-sm font-medium text-[var(--color-accent)] underline"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("todos");
                  setSelectedTypes([]);
                  setOnlyReserved(false);
                  setCoverageUnder120(false);
                }}
              >
                {inv.emptyFilter.cta}
              </button>
            </div>
          ) : null}
        </>
      )}
      </div>
    </div>
  );
}
