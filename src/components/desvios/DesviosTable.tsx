"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Bus,
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
import { useCallback, useEffect, useRef, useState } from "react";

import { DesvioImportPdfDialog } from "@/components/desvios/DesvioImportPdfDialog";
import { EstadoBadge } from "@/components/desvios/EstadoBadge";
import { OrigenBadge } from "@/components/desvios/OrigenBadge";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/components/toast-host";
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
  const refreshRef = useRef<() => void>(() => {});

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

      <FilterBar
        filters={filters}
        onChange={(patch) =>
          setFilters((prev) => ({ ...prev, ...patch, page: 1 }))
        }
        onReset={resetFilters}
        active={filtersActive}
      />

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
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
                {items.map((d) => (
                  <Row
                    key={d.id}
                    desvio={d}
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
                    <EmptyState filtersActive={filtersActive} onReset={resetFilters} />
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-accent-light)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_25%,transparent)]">
          <RouteIcon size={18} strokeWidth={1.7} aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--color-text-1)]">
            Desvios
          </h1>
          <p className="text-xs text-[var(--color-text-3)]">
            Circulares informativas detectadas automaticamente o creadas a mano.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <KpiPill
          label="Pendientes"
          value={counts.PENDIENTE}
          tone="amber"
          icon={AlertTriangle}
        />
        <KpiPill label="Activos" value={counts.ACTIVO} tone="rose" icon={Bus} />
        <KpiPill
          label="Resueltos"
          value={counts.RESUELTO}
          tone="emerald"
          icon={CheckCircle2}
        />
        {indefinidos > 0 ? (
          <KpiPill
            label="Indefinidos"
            value={indefinidos}
            tone="violet"
            icon={InfinityIcon}
            pulse
          />
        ) : null}

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Refrescar"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-xs font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)] disabled:opacity-60"
        >
          <RefreshCcw size={13} className={cn(loading && "animate-spin")} />
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
                <span className="text-[11px] font-medium text-[var(--color-error)]">
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
                  Si, limpiar
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
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgba(220,38,38,0.30)] bg-[rgba(220,38,38,0.06)] px-3 text-xs font-medium text-[var(--color-error)] transition-colors hover:bg-[rgba(220,38,38,0.10)]"
              >
                <Trash2 size={13} />
                Limpiar archivados
                <span className="ml-0.5 rounded-full bg-[rgba(220,38,38,0.15)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
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
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-xs font-semibold text-[var(--color-text-2)] transition-colors hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
          >
            <UploadCloud size={13} />
            Importar PDF
          </button>
        ) : null}

        {canCreate ? (
          <Link
            href="/desvios/nuevo"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 text-xs font-semibold text-white shadow-md shadow-[var(--color-accent)]/20 transition-all hover:bg-[var(--color-accent-hover)] hover:shadow-[var(--color-accent)]/30"
          >
            <Plus size={13} />
            Nuevo desvio
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function KpiPill({
  label,
  value,
  tone,
  icon: Icon,
  pulse,
}: {
  label: string;
  value: number;
  tone: "amber" | "rose" | "emerald" | "violet";
  icon: typeof AlertTriangle;
  /** Anima el punto indicador (usado para los desvios indefinidos vivos). */
  pulse?: boolean;
}) {
  const map: Record<typeof tone, { dot: string; text: string; border: string; ring: string }> = {
    amber: {
      dot: "bg-[#d97706]",
      text: "text-[#d97706]",
      border: "border-[rgba(217,119,6,0.30)]",
      ring: "ring-[rgba(217,119,6,0.45)]",
    },
    rose: {
      dot: "bg-[#dc2626]",
      text: "text-[#dc2626]",
      border: "border-[rgba(220,38,38,0.30)]",
      ring: "ring-[rgba(220,38,38,0.45)]",
    },
    emerald: {
      dot: "bg-[#059669]",
      text: "text-[#059669]",
      border: "border-[rgba(5,150,105,0.30)]",
      ring: "ring-[rgba(5,150,105,0.45)]",
    },
    violet: {
      dot: "bg-[#7c3aed]",
      text: "text-[#7c3aed]",
      border: "border-[rgba(124,58,237,0.32)]",
      ring: "ring-[rgba(124,58,237,0.45)]",
    },
  };
  const c = map[tone];
  return (
    <span
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border bg-[var(--color-surface-2)]/55 px-3 text-[11px] font-medium text-[var(--color-text-2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        c.border,
      )}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        {pulse ? (
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-full opacity-70",
              c.dot,
            )}
            aria-hidden
          />
        ) : null}
        <span className={cn("relative h-1.5 w-1.5 rounded-full", c.dot)} aria-hidden />
      </span>
      <Icon size={12} strokeWidth={1.8} className={c.text} />
      <span className="text-[var(--color-text-3)]">{label}</span>
      <strong className={cn("font-semibold tabular-nums", c.text)}>{value}</strong>
    </span>
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
    <div className="rounded-2xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface)] to-[var(--color-surface-2)] p-3 shadow-sm">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
        <div className="md:col-span-3">
          <label className="text-label mb-1 block text-[var(--color-text-3)]">Buscar</label>
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
              aria-hidden
            />
            <Input
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
              placeholder="Via, tramo, motivo, referencia…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="text-label mb-1 block text-[var(--color-text-3)]">Estado</label>
          <Select
            value={filters.estado}
            onValueChange={(v) => onChange({ estado: v as Filters["estado"] })}
            aria-label="Filtrar por estado"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="ACTIVO">Activo</option>
            <option value="RESUELTO">Resuelto</option>
            <option value="CANCELADO">Cancelado</option>
          </Select>
        </div>

        <div className="md:col-span-2">
          <label className="text-label mb-1 block text-[var(--color-text-3)]">Sentido</label>
          <Select
            value={filters.sentido}
            onValueChange={(v) => onChange({ sentido: v as Filters["sentido"] })}
            aria-label="Filtrar por sentido"
          >
            <option value="TODOS">Cualquiera</option>
            <option value="IDA">Ida</option>
            <option value="VUELTA">Vuelta</option>
            <option value="AMBOS">Ambos</option>
          </Select>
        </div>

        <div className="md:col-span-1">
          <label className="text-label mb-1 block text-[var(--color-text-3)]">Linea</label>
          <Input
            value={filters.linea}
            onChange={(e) => onChange({ linea: e.target.value.trim() })}
            placeholder="Ej. 19"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-label mb-1 block text-[var(--color-text-3)]">Desde</label>
          <Input
            type="date"
            value={filters.desde}
            onChange={(e) => onChange({ desde: e.target.value })}
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-label mb-1 block text-[var(--color-text-3)]">Hasta</label>
          <Input
            type="date"
            value={filters.hasta}
            onChange={(e) => onChange({ hasta: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-text-3)]">
          <span>Origen:</span>
          {(["TODOS", "EMAIL", "MANUAL"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onChange({ origen: o })}
              className={cn(
                "rounded-full border px-2.5 py-0.5 font-medium uppercase tracking-[0.05em] transition-colors",
                filters.origen === o
                  ? "border-[var(--color-accent)]/45 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]",
              )}
            >
              {o === "TODOS" ? "Todos" : o === "EMAIL" ? "Auto" : "Manual"}
            </button>
          ))}
        </div>
        {active ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
          >
            <X size={12} aria-hidden />
            Limpiar filtros
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  desvio,
  canManage,
  acting,
  onConfirm,
  onReactivate,
}: {
  desvio: DesvioResumen;
  canManage: boolean;
  acting: boolean;
  onConfirm: () => void;
  onReactivate: () => void;
}) {
  const isPendiente = desvio.estado === "PENDIENTE";
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
        "transition-colors hover:bg-[var(--color-surface-2)]/55",
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

function EmptyState({
  filtersActive,
  onReset,
}: {
  filtersActive: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-3)]">
        <Mail size={20} strokeWidth={1.5} aria-hidden />
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-[var(--color-text-1)]">
          {filtersActive ? "Sin resultados con esos filtros." : "Aun no hay desvios registrados."}
        </p>
        <p className="text-[12px] text-[var(--color-text-3)]">
          {filtersActive
            ? "Prueba a limpiar los filtros para ver el historico completo."
            : "Cuando llegue una Circular Informativa al buzon, aparecera aqui."}
        </p>
      </div>
      {filtersActive ? (
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-[11px] font-medium text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
        >
          Limpiar filtros
        </button>
      ) : null}
    </div>
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
