"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Hourglass,
  Infinity as InfinityIcon,
  Loader2,
  Mail,
  Plus,
  Power,
  RefreshCcw,
  Route as RouteIcon,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { DesvioImportPdfDialog } from "@/components/desvios/DesvioImportPdfDialog";
import { EstadoBadge } from "@/components/desvios/EstadoBadge";
import { OrigenBadge } from "@/components/desvios/OrigenBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import {
  FilterDivider,
  FilterLabeledGroup,
  FilterPills,
} from "@/components/ui/ticket-filter-bar";
import { kpiToneValueClass, type KpiTone } from "@/components/ui/kpi-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/toast-host";
import { isFreshItem, useNewItemIds } from "@/hooks/use-animated-list";
import { canaryParts } from "@/lib/datetime/canary";
import type {
  DesvioEstado,
  DesvioOrigen,
  DesvioResumen,
  DesvioSentido,
} from "@/lib/desvios/types";
import { cn } from "@/lib/utils";

type Filters = {
  estado: DesvioEstado | "TODOS";
  sentido: DesvioSentido | "TODOS";
  origen: DesvioOrigen | "TODOS";
  linea: string;
  search: string;
  desde: string;
  hasta: string;
  page: number;
};

const DEFAULT_FILTERS: Filters = {
  estado: "TODOS",
  sentido: "TODOS",
  origen: "TODOS",
  linea: "",
  search: "",
  desde: "",
  hasta: "",
  page: 1,
};

type Counts = Record<DesvioEstado, number>;

type Props = {
  canCreate: boolean;
  canManage: boolean;
  canDelete: boolean;
};

export function DesviosTable({ canCreate, canManage, canDelete }: Props) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [items, setItems] = useState<DesvioResumen[]>([]);
  const [counts, setCounts] = useState<Counts>({
    PENDIENTE: 0,
    ACTIVO: 0,
    RESUELTO: 0,
    CANCELADO: 0,
  });
  // Cuantos desvios visibles son "indefinidos" (sin fecha de fin). Se calcula
  // sobre la pagina cargada porque el backend aun no agrupa por ese flag; es
  // suficiente para que el operador vea "hay X corte abierto" de un vistazo.
  const indefinidosVivos = items.filter(
    (d) => d.sin_fecha_fin && (d.estado === "PENDIENTE" || d.estado === "ACTIVO"),
  ).length;
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [cleanupAsking, setCleanupAsking] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [toolbarStuck, setToolbarStuck] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const toolbarSentinelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.estado !== "TODOS") params.set("estado", filters.estado);
      if (filters.sentido !== "TODOS") params.set("sentido", filters.sentido);
      if (filters.origen !== "TODOS") params.set("origen", filters.origen);
      if (filters.linea) params.set("linea", filters.linea);
      if (filters.search) params.set("q", filters.search);
      if (filters.desde) params.set("desde", `${filters.desde}T00:00:00.000Z`);
      if (filters.hasta) params.set("hasta", `${filters.hasta}T23:59:59.999Z`);
      params.set("page", String(filters.page));
      const res = await fetch(`/api/desvios?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setItems([]);
        setTotal(0);
        return;
      }
      const data = (await res.json()) as {
        items: DesvioResumen[];
        total: number;
        pages: number;
        counts: Counts;
      };
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPages(Math.max(1, data.pages ?? 1));
      if (data.counts) setCounts(data.counts);
    } catch (err) {
      console.error(err);
      toast.error("No se pudieron cargar los desvios");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    refreshRef.current = load;
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const el = toolbarSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setToolbarStuck(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-1px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Suscripcion al SSE: refrescamos la lista cuando llega un evento de desvio.
  // La carga es barata (paginada y filtrada en servidor) asi que recargamos
  // toda la pagina actual en lugar de patchear filas a mano.
  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");
    const onNuevo = () => {
      refreshRef.current();
    };
    const onActualizado = () => {
      refreshRef.current();
    };
    source.addEventListener("desvio_nuevo", onNuevo as EventListener);
    source.addEventListener("desvio_actualizado", onActualizado as EventListener);
    source.onerror = () => {
      // ignoramos, ya hay reintento automatico del EventSource.
    };
    return () => {
      source.removeEventListener("desvio_nuevo", onNuevo as EventListener);
      source.removeEventListener("desvio_actualizado", onActualizado as EventListener);
      source.close();
    };
  }, []);

  const handleConfirm = async (id: string) => {
    if (acting[id]) return;
    setActing((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/desvios/${id}/confirmar`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo confirmar");
      }
      toast.success("Desvio confirmado y activo");
      await load();
    } catch (err) {
      toast.error("Error al confirmar", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setActing((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleReactivate = async (id: string) => {
    if (acting[id]) return;
    setActing((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/desvios/${id}/reactivar`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo reactivar");
      }
      toast.success("Desvio reactivado");
      await load();
    } catch (err) {
      toast.error("Error al reactivar", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setActing((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleCleanupArchived = async () => {
    if (cleanupRunning) return;
    setCleanupRunning(true);
    try {
      const res = await fetch("/api/desvios/limpiar-archivados", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudieron limpiar los archivados");
      }
      const data = (await res.json()) as { deleted: number };
      if (data.deleted === 0) {
        toast.info("No habia desvios archivados que limpiar");
      } else {
        toast.success(
          `Limpiados ${data.deleted} desvio${data.deleted === 1 ? "" : "s"} archivado${data.deleted === 1 ? "" : "s"}`,
        );
      }
      setCleanupAsking(false);
      await load();
    } catch (err) {
      toast.error("Error al limpiar archivados", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCleanupRunning(false);
    }
  };

  const resetFilters = () => setFilters({ ...DEFAULT_FILTERS });

  const filtersActive =
    filters.estado !== "TODOS" ||
    filters.sentido !== "TODOS" ||
    filters.origen !== "TODOS" ||
    filters.linea.length > 0 ||
    filters.search.length > 0 ||
    filters.desde.length > 0 ||
    filters.hasta.length > 0;

  const freshIds = useNewItemIds(items);

  return (
    <div className="space-y-4">
      <Header
        counts={counts}
        indefinidos={indefinidosVivos}
        loading={loading}
        canCreate={canCreate}
        canImport={canManage}
        canCleanup={canDelete}
        cleanupAsking={cleanupAsking}
        cleanupRunning={cleanupRunning}
        onRefresh={() => void load()}
        onImport={() => setImportOpen(true)}
        onAskCleanup={() => setCleanupAsking(true)}
        onCancelCleanup={() => setCleanupAsking(false)}
        onConfirmCleanup={() => void handleCleanupArchived()}
      />

      <div ref={toolbarSentinelRef} className="h-px w-full shrink-0" aria-hidden />
      <div className={cn("desvios-toolbar-sticky", toolbarStuck && "is-stuck")}>
        <FilterBar
          filters={filters}
          onChange={(patch) =>
            setFilters((prev) => ({ ...prev, ...patch, page: 1 }))
          }
          onReset={resetFilters}
          active={filtersActive}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        {/* Vista TABLA solo en md+ (8 columnas no caben en movil sin
            scroll horizontal incomodo). En movil usamos las cards de
            abajo. */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="ccmgc-table w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]/85 backdrop-blur">
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--color-text-3)]">
                  <Th>Referencia</Th>
                  <Th>Via</Th>
                  <Th>Fechas</Th>
                  <Th>Lineas</Th>
                  <Th>Sentido</Th>
                  <Th>Estado</Th>
                  <Th>Origen</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]/70">
                <AnimatePresence initial={false}>
                  {items.map((d, index) => (
                    <Row
                      key={d.id}
                      index={index}
                      desvio={d}
                      isFresh={isFreshItem(freshIds, d.id)}
                      canManage={canManage}
                      acting={Boolean(acting[d.id])}
                      onConfirm={() => void handleConfirm(d.id)}
                      onReactivate={() => void handleReactivate(d.id)}
                    />
                  ))}
                </AnimatePresence>
                {!loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <DesviosEmptyState
                        filtersActive={filtersActive}
                        onReset={resetFilters}
                      />
                    </td>
                  </tr>
                ) : null}
                {loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center">
                      <span className="inline-flex items-center gap-2 text-sm text-[var(--color-text-3)]">
                        <Loader2 size={14} className="animate-spin" />
                        Cargando desvios{"\u2026"}
                      </span>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* Vista CARDS para movil (mismo conjunto de datos, layout vertical). */}
        <div className="space-y-2 p-2 md:hidden">
          <AnimatePresence initial={false}>
            {items.map((d, index) => (
              <MobileCard
                key={d.id}
                index={index}
                desvio={d}
                isFresh={isFreshItem(freshIds, d.id)}
                canManage={canManage}
                acting={Boolean(acting[d.id])}
                onConfirm={() => void handleConfirm(d.id)}
                onReactivate={() => void handleReactivate(d.id)}
              />
            ))}
          </AnimatePresence>
          {!loading && items.length === 0 ? (
            <div className="px-2 py-10 text-center">
              <DesviosEmptyState filtersActive={filtersActive} onReset={resetFilters} />
            </div>
          ) : null}
          {loading && items.length === 0 ? (
            <div className="px-2 py-8 text-center">
              <span className="inline-flex items-center gap-2 text-sm text-[var(--color-text-3)]">
                <Loader2 size={14} className="animate-spin" />
                Cargando desvios{"\u2026"}
              </span>
            </div>
          ) : null}
        </div>

        <Pagination
          page={filters.page}
          pages={pages}
          total={total}
          onChange={(page) => setFilters((prev) => ({ ...prev, page }))}
        />
      </div>

      {canManage ? (
        <DesvioImportPdfDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            // Refrescamos la lista para mostrar los recien creados; el SSE
            // tambien dispara `refreshRef.current()`, pero la espera del round-
            // trip puede notarse asi que recargamos en cuanto el servidor confirma.
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-2.5 font-semibold text-[var(--color-text-2)]">
      {children}
    </th>
  );
}

function DesviosKpiStrip({
  counts,
  indefinidos,
}: {
  counts: Counts;
  indefinidos: number;
}) {
  const items: { value: number; label: string; tone: KpiTone; pulse?: boolean }[] = [
    { value: counts.PENDIENTE, label: "Pendientes", tone: "warning" },
    { value: counts.ACTIVO, label: "Activos", tone: "error" },
    { value: counts.RESUELTO, label: "Resueltos", tone: "success" },
    ...(indefinidos > 0
      ? [{ value: indefinidos, label: "Indefinidos", tone: "violet" as const, pulse: true }]
      : []),
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end sm:gap-x-3"
      aria-label="Resumen por estado"
    >
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 ? (
            <span className="hidden h-3 w-px shrink-0 bg-[var(--color-border)]/50 sm:inline" aria-hidden />
          ) : null}
          <span
            className={cn(
              "inline-flex items-baseline gap-1 whitespace-nowrap",
              item.pulse && "animate-pulse",
            )}
            title={`${item.value} ${item.label}`}
          >
            <span
              className={cn(
                "text-[13px] font-bold tabular-nums leading-none sm:text-sm",
                item.value === 0 ? "text-[var(--color-text-3)]" : kpiToneValueClass(item.tone),
              )}
            >
              {item.value}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
              {item.label}
            </span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function Header({
  counts,
  indefinidos,
  loading,
  canCreate,
  canImport,
  canCleanup,
  cleanupAsking,
  cleanupRunning,
  onRefresh,
  onImport,
  onAskCleanup,
  onCancelCleanup,
  onConfirmCleanup,
}: {
  counts: Counts;
  indefinidos: number;
  loading: boolean;
  canCreate: boolean;
  canImport: boolean;
  canCleanup: boolean;
  cleanupAsking: boolean;
  cleanupRunning: boolean;
  onRefresh: () => void;
  onImport: () => void;
  onAskCleanup: () => void;
  onCancelCleanup: () => void;
  onConfirmCleanup: () => void;
}) {
  const archivedCount = counts.RESUELTO + counts.CANCELADO;
  return (
    <header className="desvios-hero flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
            <RouteIcon size={20} strokeWidth={1.7} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="ccmgc-eyebrow dashboard-pretitle">
              <span className="ccmgc-eyebrow-dot ccmgc-eyebrow-dot--pulse dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
              CCMGC · Operación
            </div>
            <h1 className="dashboard-hero-title mt-1 text-[22px] font-semibold leading-tight tracking-tight sm:text-[24px]">
              Desvíos
            </h1>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
              Circulares informativas detectadas automáticamente o creadas a mano.
              Confirma los pendientes, archiva los resueltos.
            </p>
          </div>
        </div>

        <DesviosKpiStrip counts={counts} indefinidos={indefinidos} />
      </div>

      <div className="desvios-action-row flex flex-wrap items-center gap-2 border-t border-[var(--color-border)]/60 pt-3">
        <div className="desvios-action-row__secondary flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Refrescar"
          className="desvios-action-chip disabled:opacity-60"
        >
          <RefreshCcw size={14} className={cn(loading && "animate-spin")} />
          Refrescar
        </button>

        {canCleanup && archivedCount > 0 ? (
          <AnimatePresence mode="wait" initial={false}>
            {cleanupAsking ? (
              <motion.div
                key="confirm-cleanup"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-1.5"
              >
                <span className="text-[11px] font-semibold text-[var(--color-error)]">
                  {"\u00BF"}Borrar {archivedCount}?
                </span>
                <button
                  type="button"
                  onClick={onConfirmCleanup}
                  disabled={cleanupRunning}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-error)] px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {cleanupRunning ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                  Sí, limpiar
                </button>
                <button
                  type="button"
                  onClick={onCancelCleanup}
                  disabled={cleanupRunning}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 text-[12px] font-medium text-[var(--color-text-2)] disabled:opacity-60"
                >
                  <X size={12} />
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="ask-cleanup"
                type="button"
                onClick={onAskCleanup}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                title="Eliminar definitivamente los desvios resueltos y cancelados"
                className="desvios-action-chip desvios-action-chip--danger"
              >
                <Trash2 size={14} />
                Limpiar archivados
                <span className="ml-0.5 rounded-full bg-[rgba(220,38,38,0.18)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                  {archivedCount}
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        ) : null}

        {canImport ? (
          <button
            type="button"
            onClick={onImport}
            title="Subir manualmente una Circular Informativa en PDF"
            className="desvios-action-chip"
          >
            <UploadCloud size={14} />
            Importar PDF
          </button>
        ) : null}
        </div>

        {canCreate ? (
          <Link
            href="/desvios/nuevo"
            className="ccmgc-module-cta ccmgc-module-cta--mobile-block group sm:ml-auto"
          >
            <span className="ccmgc-module-cta__icon" aria-hidden>
              <Plus size={16} strokeWidth={2} />
            </span>
            <span className="ccmgc-module-cta__body">
              <span className="ccmgc-module-cta__label">Nuevo desvío</span>
              <span className="ccmgc-module-cta__hint">Crear manualmente</span>
            </span>
            <span className="ccmgc-module-cta__arrow" aria-hidden>
              <ArrowRight size={14} strokeWidth={2.2} />
            </span>
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function FilterBar({
  filters,
  onChange,
  onReset,
  active,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
  active: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 w-full basis-full sm:min-w-[12rem] sm:flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-[var(--color-text-3)]"
            aria-hidden
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Via, tramo, motivo, referencia…"
            className="h-9 w-full rounded-lg border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-9 pr-8 text-[12.5px] shadow-sm"
            aria-label="Buscar desvíos"
          />
          {filters.search ? (
            <button
              type="button"
              onClick={() => onChange({ search: "" })}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
            >
              <X size={12} aria-hidden />
            </button>
          ) : null}
        </div>
        {active ? (
          <button type="button" onClick={onReset} className="desvios-action-chip !h-7">
            <X size={12} aria-hidden />
            Limpiar filtros
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-5 lg:gap-y-2">
        <FilterLabeledGroup label="Estado">
          <FilterPills
            value={filters.estado}
            onChange={(v) => onChange({ estado: v as Filters["estado"] })}
            options={[
              { v: "TODOS", label: "Todos" },
              { v: "PENDIENTE", label: "Pendiente" },
              { v: "ACTIVO", label: "Activo" },
              { v: "RESUELTO", label: "Resuelto" },
              { v: "CANCELADO", label: "Cancelado" },
            ]}
          />
        </FilterLabeledGroup>

        <FilterDivider className="hidden lg:block" />

        <FilterLabeledGroup label="Sentido">
          <FilterPills
            value={filters.sentido}
            onChange={(v) => onChange({ sentido: v as Filters["sentido"] })}
            options={[
              { v: "TODOS", label: "Cualquiera" },
              { v: "IDA", label: "Ida" },
              { v: "VUELTA", label: "Vuelta" },
              { v: "AMBOS", label: "Ambos" },
            ]}
          />
        </FilterLabeledGroup>

        <FilterDivider className="hidden lg:block" />

        <FilterLabeledGroup label="Origen">
          <FilterPills
            value={filters.origen}
            onChange={(v) => onChange({ origen: v as Filters["origen"] })}
            options={[
              { v: "TODOS", label: "Todos" },
              { v: "EMAIL", label: "Auto" },
              { v: "MANUAL", label: "Manual" },
            ]}
          />
        </FilterLabeledGroup>
      </div>

      <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-5 lg:gap-y-2">
        <FilterLabeledGroup label="Línea">
          <LineaFilterField
            value={filters.linea}
            onChange={(linea) => onChange({ linea })}
          />
        </FilterLabeledGroup>

        <FilterDivider className="hidden lg:block" />

        <FilterLabeledGroup label="Período">
          <div className="flex flex-wrap items-center gap-1.5">
            <DatePickerField
              compact
              value={filters.desde}
              onChange={(v) => onChange({ desde: v })}
              placeholder="Desde"
              ariaLabel="Fecha desde"
              className="w-full min-w-0 sm:w-[9.5rem]"
            />
            <ArrowRight
              size={12}
              className="hidden shrink-0 text-[var(--color-text-3)] sm:block"
              aria-hidden
            />
            <DatePickerField
              compact
              value={filters.hasta}
              onChange={(v) => onChange({ hasta: v })}
              placeholder="Hasta"
              ariaLabel="Fecha hasta"
              className="w-full min-w-0 sm:w-[9.5rem]"
            />
            {(filters.desde || filters.hasta) ? (
              <button
                type="button"
                onClick={() => onChange({ desde: "", hasta: "" })}
                className="desvios-action-chip !h-7 shrink-0"
                title="Quitar filtro de fechas"
              >
                <X size={11} aria-hidden />
                Fechas
              </button>
            ) : null}
          </div>
        </FilterLabeledGroup>
      </div>
    </div>
  );
}

/** Campo de filtro por línea con el mismo lenguaje visual que la búsqueda y las pills. */
function LineaFilterField({
  value,
  onChange,
}: {
  value: string;
  onChange: (linea: string) => void;
}) {
  const active = value.trim().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className={cn(
          "relative flex h-9 min-w-[9rem] max-w-[11rem] flex-1 items-center rounded-lg border bg-[var(--color-surface)] shadow-sm transition-colors sm:min-w-[10rem]",
          active
            ? "border-[var(--color-accent)]/45 ring-1 ring-[var(--color-accent)]/15"
            : "border-[var(--color-border)] focus-within:border-[var(--color-accent)]/40 focus-within:ring-1 focus-within:ring-[var(--color-accent)]/15",
        )}
      >
        <RouteIcon
          size={13}
          strokeWidth={2}
          className={cn(
            "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2",
            active ? "text-[var(--color-accent)]" : "text-[var(--color-text-3)]",
          )}
          aria-hidden
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ej. 205, 250…"
          aria-label="Filtrar por línea"
          className={cn(
            "h-full w-full border-0 bg-transparent py-0 pl-8 pr-7 text-[12px] shadow-none focus-visible:ring-0",
            active && "font-semibold text-[var(--color-accent)] placeholder:text-[var(--color-accent)]/50",
          )}
        />
        {active ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Quitar filtro de línea"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
          >
            <X size={12} aria-hidden />
          </button>
        ) : null}
      </div>
      {active ? (
        <span className="inline-flex h-6 items-center gap-1 rounded-full border border-[var(--color-accent)]/35 bg-[var(--color-accent-light)]/50 px-2 text-[10.5px] font-semibold text-[var(--color-accent)]">
          <RouteIcon size={10} aria-hidden />
          {value.trim()}
        </span>
      ) : (
        <span className="hidden text-[10.5px] text-[var(--color-text-3)] sm:inline">
          Filtra desvíos que afecten a esa línea
        </span>
      )}
    </div>
  );
}

/**
 * Tarjeta compacta para listar desvios en MOVIL. Replica visualmente la
 * fila de la tabla pero apilando la informacion en bloques verticales.
 */
function staggerClass(index: number): string {
  return `ccmgc-stagger-in ccmgc-stagger-in-${(index % 6) + 1}`;
}

function MobileCard({
  desvio,
  index,
  isFresh,
  canManage,
  acting,
  onConfirm,
  onReactivate,
}: {
  desvio: DesvioResumen;
  index: number;
  isFresh?: boolean;
  canManage: boolean;
  acting: boolean;
  onConfirm: () => void;
  onReactivate: () => void;
}) {
  const isPendiente = desvio.estado === "PENDIENTE";
  const isActivo = desvio.estado === "ACTIVO";
  const isResuelto = desvio.estado === "RESUELTO";
  const isIndefVivo = desvio.sin_fecha_fin && (isPendiente || isActivo);
  const canQuickReactivate = isResuelto && desvio.sin_fecha_fin && canManage;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        staggerClass(index),
        "relative overflow-hidden rounded-xl border bg-[var(--color-surface)] p-3 shadow-sm",
        isFresh && "ccmgc-row-enter",
        isPendiente && "desvios-row--pendiente ccmgc-pulse-border",
        isIndefVivo
          ? "border-[rgba(124,58,237,0.30)] bg-[rgba(124,58,237,0.04)]"
          : isPendiente
            ? "border-[rgba(217,119,6,0.30)] bg-[rgba(217,119,6,0.05)]"
            : "border-[var(--color-border)]",
      )}
    >
      {isIndefVivo ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 bg-[#7c3aed]"
        />
      ) : null}
      <div className="min-w-0">
          <p className="truncate font-mono text-[11px] text-[var(--color-text-3)]">
            {desvio.referencia}
          </p>
          <Link
            href={`/desvios/${desvio.id}`}
            className="mt-0.5 block truncate text-[14px] font-semibold text-[var(--color-text-1)] hover:text-[var(--color-accent)]"
          >
            {desvio.via}
          </Link>
          <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-text-3)]">
            {desvio.tramo}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <EstadoBadge estado={desvio.estado} size="sm" />
            <OrigenBadge origen={desvio.origen} size="sm" />
          </div>
        </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-[var(--color-text-2)]">
        <FechasCell
          inicio={desvio.fecha_inicio}
          fin={desvio.fecha_fin}
          estimada={desvio.hora_fin_estimada}
          sinFin={desvio.sin_fecha_fin}
        />
        <SentidoChip sentido={desvio.sentido} />
      </div>

      {desvio.lineas_afectadas.length > 0 ? (
        <div className="mt-2">
          <LineasChips lineas={desvio.lineas_afectadas} />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border)]/60 pt-2.5">
        {isPendiente && canManage ? (
          <button
            type="button"
            onClick={onConfirm}
            disabled={acting}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-[var(--color-success)] px-2.5 text-[11.5px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {acting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Confirmar
          </button>
        ) : null}
        {canQuickReactivate ? (
          <button
            type="button"
            onClick={onReactivate}
            disabled={acting}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-[#7c3aed] px-2.5 text-[11.5px] font-semibold text-white shadow-sm transition-opacity hover:bg-[#6d28d9] disabled:opacity-60"
          >
            {acting ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
            Reactivar
          </button>
        ) : null}
        <Link
          href={`/desvios/${desvio.id}`}
          className="ml-auto inline-flex h-9 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 text-[11.5px] font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
        >
          Detalle
          <ChevronRight size={12} />
        </Link>
        {desvio.pdf_path ? (
          <a
            href={desvio.pdf_path}
            target="_blank"
            rel="noreferrer"
            title="Ver PDF original"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
          >
            <FileText size={12} />
          </a>
        ) : null}
      </div>
    </motion.div>
  );
}

function Row({
  desvio,
  index,
  isFresh,
  canManage,
  acting,
  onConfirm,
  onReactivate,
}: {
  desvio: DesvioResumen;
  index: number;
  isFresh?: boolean;
  canManage: boolean;
  acting: boolean;
  onConfirm: () => void;
  onReactivate: () => void;
}) {
  const isPendiente = desvio.estado === "PENDIENTE";
  const isActivo = desvio.estado === "ACTIVO";
  const isResuelto = desvio.estado === "RESUELTO";
  const isIndefVivo =
    desvio.sin_fecha_fin &&
    (desvio.estado === "PENDIENTE" || desvio.estado === "ACTIVO");
  // Para los indefinidos resueltos, dejamos una accion rapida en la fila
  // para volverlos a poner ACTIVO sin abrir el detalle, util cuando el
  // operador gestiona varios cortes recurrentes a la vez.
  const canQuickReactivate = isResuelto && desvio.sin_fecha_fin && canManage;
  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        staggerClass(index),
        "transition-colors hover:bg-[var(--color-surface-2)]/55",
        isFresh && "ccmgc-row-enter",
        isActivo && "desvios-row--activo",
        isPendiente && "desvios-row--pendiente ccmgc-pulse-border",
        // Tinte violeta sutil para los indefinidos vivos (manda sobre el
        // tinte amarillo de "pendiente" porque ese estado tambien aparece
        // marcado como indefinido en muchos casos).
        isIndefVivo
          ? "bg-[rgba(124,58,237,0.045)] shadow-[inset_2px_0_0_rgba(124,58,237,0.45)]"
          : isPendiente
            ? "bg-[rgba(217,119,6,0.06)]"
            : "odd:bg-[var(--color-surface)] even:bg-[var(--color-surface-2)]/30",
      )}
    >
      <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-[var(--color-text-2)]">
        <Link
          href={`/desvios/${desvio.id}`}
          className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
        >
          {desvio.referencia}
        </Link>
      </td>
      <td className="max-w-[18rem] truncate px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent-light)] text-[var(--color-accent)]"
            aria-hidden
          >
            <RouteIcon size={12} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--color-text-1)]">{desvio.via}</p>
            <p className="truncate text-[11px] text-[var(--color-text-3)]">{desvio.tramo}</p>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-[12px] text-[var(--color-text-2)]">
        <FechasCell
          inicio={desvio.fecha_inicio}
          fin={desvio.fecha_fin}
          estimada={desvio.hora_fin_estimada}
          sinFin={desvio.sin_fecha_fin}
        />
      </td>
      <td className="px-4 py-3">
        <LineasChips lineas={desvio.lineas_afectadas} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <SentidoChip sentido={desvio.sentido} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <EstadoBadge estado={desvio.estado} size="sm" />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <OrigenBadge origen={desvio.origen} size="sm" />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex items-center gap-1.5">
          {isPendiente && canManage ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={acting}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--color-success)] px-2 text-[11px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              title="Confirmar y poner en ACTIVO"
            >
              {acting ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
              Confirmar
            </button>
          ) : null}
          {canQuickReactivate ? (
            <button
              type="button"
              onClick={onReactivate}
              disabled={acting}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[#7c3aed] px-2 text-[11px] font-semibold text-white shadow-sm transition-opacity hover:bg-[#6d28d9] disabled:opacity-60"
              title="Reactivar desvio indefinido (vuelve a ACTIVO)"
            >
              {acting ? <Loader2 size={11} className="animate-spin" /> : <Power size={11} />}
              Reactivar
            </button>
          ) : null}
          <Link
            href={`/desvios/${desvio.id}`}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-[11px] font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
          >
            Detalle
            <ChevronRight size={11} />
          </Link>
          {desvio.pdf_path ? (
            <a
              href={desvio.pdf_path}
              target="_blank"
              rel="noreferrer"
              title="Ver PDF original"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
            >
              <FileText size={11} />
            </a>
          ) : null}
        </div>
      </td>
    </motion.tr>
  );
}

function LineasChips({ lineas }: { lineas: string[] }) {
  if (lineas.length === 0) {
    return <span className="text-[11px] text-[var(--color-text-3)]">{"\u2014"}</span>;
  }
  const visible = lineas.slice(0, 4);
  const extra = lineas.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((l) => (
        <span
          key={l}
          className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 text-[10.5px] font-semibold text-[var(--color-text-1)]"
        >
          {l}
        </span>
      ))}
      {extra > 0 ? (
        <span className="text-[10.5px] text-[var(--color-text-3)]">+{extra}</span>
      ) : null}
    </div>
  );
}

function FechasCell({
  inicio,
  fin,
  estimada,
  sinFin,
}: {
  inicio: string;
  fin: string;
  estimada: boolean;
  sinFin: boolean;
}) {
  const di = new Date(inicio);
  const fechaInicio = formatShortDate(di);
  const horaInicio = formatHour(di);

  // Indefinido: solo mostramos el inicio y un chip "Indefinido" en lugar del
  // tramo horario completo. La idea es que el operador entienda de un vistazo
  // que ese desvio no caduca solo.
  if (sinFin) {
    return (
      <div className="flex flex-col">
        <span className="font-medium text-[var(--color-text-1)]">{fechaInicio}</span>
        <span className="inline-flex items-center gap-1 text-[var(--color-text-3)]">
          <span className="tabular-nums">{horaInicio}</span>
          <ArrowRight
            size={10}
            strokeWidth={2}
            className="opacity-60"
            aria-hidden
          />
          <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(124,58,237,0.40)] bg-[rgba(124,58,237,0.10)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#7c3aed]">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span
                className="absolute inset-0 animate-ping rounded-full bg-[#7c3aed] opacity-60"
                aria-hidden
              />
              <span
                className="relative h-1.5 w-1.5 rounded-full bg-[#7c3aed]"
                aria-hidden
              />
            </span>
            <InfinityIcon size={10} strokeWidth={2.2} aria-hidden />
            Indefinido
          </span>
        </span>
      </div>
    );
  }

  const df = new Date(fin);
  // Same-day en TZ Atlantic/Canary para que coincida con la hora canaria que
  // se muestra abajo, no con la del navegador.
  const pi = canaryParts(di);
  const pf = canaryParts(df);
  const sameDay =
    pi.year === pf.year && pi.month === pf.month && pi.day === pf.day;
  const horaFin = formatHour(df);
  return (
    <div className="flex flex-col">
      <span className="font-medium text-[var(--color-text-1)]">{fechaInicio}</span>
      <span className="inline-flex items-center gap-1 text-[var(--color-text-3)]">
        <span className="tabular-nums">{horaInicio}</span>
        <ArrowRight
          size={10}
          strokeWidth={2}
          className="opacity-60"
          aria-hidden
        />
        {estimada ? (
          <Hourglass
            size={10}
            strokeWidth={2}
            className="text-[#d97706]"
            aria-label="Hora de fin aproximada"
          />
        ) : null}
        <span className="tabular-nums">{horaFin}</span>
        {sameDay ? null : (
          <span className="ml-1 text-[10px] uppercase tracking-[0.05em] text-[var(--color-text-3)]/70">
            ({formatShortDate(df)})
          </span>
        )}
      </span>
    </div>
  );
}

function Pagination({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-2.5 text-[12px] text-[var(--color-text-3)]">
      <span>
        {total === 0 ? "Sin desvios" : `${total} desvio${total === 1 ? "" : "s"} en total`}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-[11px] disabled:opacity-50"
        >
          <ChevronLeft size={11} /> Anterior
        </button>
        <span className="px-2 text-[var(--color-text-2)]">
          {page} / {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-[11px] disabled:opacity-50"
        >
          Siguiente <ChevronRight size={11} />
        </button>
      </div>
    </div>
  );
}

function DesviosEmptyState({
  filtersActive,
  onReset,
}: {
  filtersActive: boolean;
  onReset: () => void;
}) {
  return (
    <EmptyState
      icon={filtersActive ? Search : Mail}
      title={
        filtersActive ? "Sin resultados con esos filtros" : "Aún no hay desvíos registrados"
      }
      hint={
        filtersActive
          ? "Prueba a limpiar los filtros para ver el histórico completo."
          : "Cuando llegue una Circular Informativa al buzón, aparecerá aquí."
      }
      actionLabel={filtersActive ? "Limpiar filtros" : undefined}
      onAction={filtersActive ? onReset : undefined}
      compact
    />
  );
}

/** Chip con icono direccional para el sentido afectado. */
function SentidoChip({ sentido }: { sentido: DesvioSentido }) {
  const cls =
    "inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.04em] text-[var(--color-text-1)]";
  if (sentido === "AMBOS") {
    return (
      <span className={cls}>
        <ArrowLeftRight
          size={10}
          strokeWidth={2}
          className="text-[var(--color-accent)]"
          aria-hidden
        />
        Ambos
      </span>
    );
  }
  if (sentido === "IDA") {
    return (
      <span className={cls}>
        <ArrowRight
          size={10}
          strokeWidth={2}
          className="text-[var(--color-accent)]"
          aria-hidden
        />
        Ida
      </span>
    );
  }
  return (
    <span className={cls}>
      <ArrowRight
        size={10}
        strokeWidth={2}
        className="rotate-180 text-[var(--color-accent)]"
        aria-hidden
      />
      Vuelta
    </span>
  );
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Atlantic/Canary",
  });
}

function formatHour(d: Date): string {
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Atlantic/Canary",
  });
}
