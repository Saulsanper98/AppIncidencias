"use client";

/**
 * ReadOnlyTicketsViewer
 * ───────────────────────────────────────────────────────────────────────
 * Visor de incidencias optimizado para LEER en pantalla, sin acciones.
 *
 * Características visuales clave (todas pensadas para una pantalla de
 * consulta que está siempre encendida en el centro de control):
 *
 *   - Tipografía grande, contraste alto, mucho aire.
 *   - Por defecto se OCULTAN los resueltos (toggle "Activas" como default).
 *   - Auto-refresh silencioso cada 30 s con detección de NUEVOS tickets
 *     (resaltado dorado durante 6 s).
 *   - **Agrupación temporal** ("Hoy", "Ayer", "Esta semana", "Más antiguas")
 *     con separadores tipográficos.
 *   - **Avatar redondo del bus** con color por operadora y otro pequeño
 *     con iniciales del técnico asignado.
 *   - **Antigüedad coloreada**: verde < 1 h, amarillo < 24 h, rojo > 24 h.
 *   - **Halo rojo de alta prioridad** en cards críticas.
 *   - KPIs gigantes con sub-indicador (cambio vs ayer).
 *   - Botón flotante "↑ Subir" cuando se ha scrolleado.
 *   - Modo Wallboard (`Maximize2`) con tipografía aún mayor para
 *     pantallas grandes / proyectores.
 *   - Cero botones de mutación.
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  Bus as BusIcon,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  Filter,
  Layers,
  Loader2,
  MapPin,
  Maximize2,
  MessageCircle,
  Minimize2,
  Paperclip,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Users as UsersIcon,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// ─── Tipos (subset de /api/tickets) ──────────────────────────────────────────

type TicketStatus = "abierto" | "en_proceso" | "esperando_repuesto" | "resuelto";
type TicketPriority = "alta" | "media" | "baja";

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  downloadUrl: string | null;
};

type Comment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

type Ticket = {
  id: string;
  busId: string;
  assetId: string;
  operator: string;
  municipio: string | null;
  lineaLabel: string | null;
  servicioLabel: string | null;
  conductorLabel: string | null;
  // Clasificación de la tipología (Comunicaciones, Billetaje, etc.)
  // Permite que el visor filtre "solo incidencias de X tipo".
  tipo?: string | null;
  subtipo?: string | null;
  subsubtipo?: string | null;
  dominio?: string | null;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  assignedToUserName: string | null;
  attachments: Attachment[];
  comments: Comment[];
};

type ApiResponse = { tickets: Ticket[] };

// ─── Meta de UI ─────────────────────────────────────────────────────────────

const STATUS_META: Record<
  TicketStatus,
  { label: string; color: string; bg: string; ring: string; Icon: typeof CheckCircle2 }
> = {
  abierto: {
    label: "Abierto",
    color: "text-amber-300",
    bg: "bg-amber-500/15",
    ring: "ring-amber-500/40",
    Icon: AlertCircle,
  },
  en_proceso: {
    label: "En proceso",
    color: "text-sky-300",
    bg: "bg-sky-500/15",
    ring: "ring-sky-500/40",
    Icon: Loader2,
  },
  esperando_repuesto: {
    label: "Esperando repuesto",
    color: "text-violet-300",
    bg: "bg-violet-500/15",
    ring: "ring-violet-500/40",
    Icon: Clock,
  },
  resuelto: {
    label: "Resuelto",
    color: "text-emerald-300",
    bg: "bg-emerald-500/15",
    ring: "ring-emerald-500/40",
    Icon: CheckCircle2,
  },
};

const PRIORITY_META: Record<
  TicketPriority,
  { label: string; color: string; bg: string; bar: string; Icon: typeof AlertTriangle }
> = {
  alta: {
    label: "Alta",
    color: "text-[var(--color-error)]",
    bg: "bg-[var(--color-error-light)]",
    bar: "bg-gradient-to-b from-[var(--color-error)] to-[var(--color-error)]/60",
    Icon: AlertTriangle,
  },
  media: {
    label: "Media",
    color: "text-amber-300",
    bg: "bg-amber-500/12",
    bar: "bg-gradient-to-b from-amber-400 to-amber-500/60",
    Icon: AlertCircle,
  },
  baja: {
    label: "Baja",
    color: "text-emerald-300",
    bg: "bg-emerald-500/12",
    bar: "bg-gradient-to-b from-emerald-400 to-emerald-500/50",
    Icon: CheckCircle2,
  },
};

const REFRESH_INTERVAL_MS = 30_000;
const NEW_HIGHLIGHT_MS = 6_000;
const WALLBOARD_STORAGE_KEY = "ccmgc_lectura_wallboard";
const SHOW_RESOLVED_STORAGE_KEY = "ccmgc_lectura_show_resolved";

// ─── Componente principal ────────────────────────────────────────────────────

export function ReadOnlyTicketsViewer() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const [connOk, setConnOk] = useState(true);

  // IDs marcados como "recién llegados" durante el último polling.
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  // Mantenemos un set de IDs vistos para detectar novedades en cada polling.
  const seenIdsRef = useRef<Set<string> | null>(null);

  // Filtros (todos respetan "todos" como valor neutro = sin filtrar).
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "todos" | "activos">(
    "activos",
  );
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "todos">("todos");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [onlyLast24h, setOnlyLast24h] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Filtros granulares (los pidió el usuario para poder buscar un tipo
  // concreto de incidencia en la pantalla de lectura). Por defecto "todos".
  const [typeFilter, setTypeFilter] = useState<string>("todos");
  const [operatorFilter, setOperatorFilter] = useState<string>("todos");
  const [busFilter, setBusFilter] = useState<string>("todos");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("todos");

  // Modo wallboard
  const [wallboard, setWallboard] = useState(false);

  // Expandido
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Botón "Ir arriba"
  const [showTop, setShowTop] = useState(false);

  // ─── Preferencias persistentes ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const wb = window.localStorage.getItem(WALLBOARD_STORAGE_KEY);
      if (wb === "1") setWallboard(true);
      const sr = window.localStorage.getItem(SHOW_RESOLVED_STORAGE_KEY);
      if (sr === "1") setStatusFilter("todos");
    } catch {
      /* localStorage puede estar bloqueado */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WALLBOARD_STORAGE_KEY, wallboard ? "1" : "0");
    } catch {
      /* */
    }
  }, [wallboard]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SHOW_RESOLVED_STORAGE_KEY,
        statusFilter === "todos" || statusFilter === "resuelto" ? "1" : "0",
      );
    } catch {
      /* */
    }
  }, [statusFilter]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [search]);

  // Scroll listener para botón "Ir arriba".
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ─── Fetch + detección de novedades ────────────────────────────────────────
  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await fetch("/api/tickets", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ApiResponse;

        // Detectar IDs nuevos (no en el set previo) y resaltarlos 6s.
        if (seenIdsRef.current) {
          const previous = seenIdsRef.current;
          const fresh = data.tickets
            .filter((t) => !previous.has(t.id))
            .map((t) => t.id);
          if (fresh.length > 0) {
            setHighlightIds((current) => {
              const next = new Set(current);
              fresh.forEach((id) => next.add(id));
              return next;
            });
            window.setTimeout(() => {
              setHighlightIds((current) => {
                const next = new Set(current);
                fresh.forEach((id) => next.delete(id));
                return next;
              });
            }, NEW_HIGHLIGHT_MS);
          }
        }
        seenIdsRef.current = new Set(data.tickets.map((t) => t.id));

        setTickets(data.tickets);
        setLastFetchAt(Date.now());
        setConnOk(true);
      } catch (err) {
        console.warn("ReadOnlyTicketsViewer:", err);
        setConnOk(false);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(false);
    const id = window.setInterval(() => void load(true), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // ─── Filtros aplicados ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const cutoff24 = Date.now() - 24 * 60 * 60 * 1000;
    return tickets.filter((t) => {
      if (statusFilter === "activos" && t.status === "resuelto") return false;
      if (
        statusFilter !== "todos" &&
        statusFilter !== "activos" &&
        t.status !== statusFilter
      )
        return false;
      if (priorityFilter !== "todos" && t.priority !== priorityFilter) return false;
      if (typeFilter !== "todos" && (t.tipo ?? "") !== typeFilter) return false;
      if (operatorFilter !== "todos" && t.operator !== operatorFilter) return false;
      if (busFilter !== "todos" && t.busId !== busFilter) return false;
      if (assigneeFilter !== "todos") {
        if (assigneeFilter === "__sin_asignar__") {
          if (t.assignedToUserName) return false;
        } else if (t.assignedToUserName !== assigneeFilter) {
          return false;
        }
      }
      if (onlyCritical && !(t.priority === "alta" && t.status !== "resuelto"))
        return false;
      if (onlyLast24h && new Date(t.createdAt).getTime() < cutoff24) return false;
      if (debouncedSearch) {
        const haystack = `${t.id} ${t.title} ${t.description} ${t.busId} ${t.operator} ${t.lineaLabel ?? ""} ${t.tipo ?? ""} ${t.subtipo ?? ""} ${t.subsubtipo ?? ""}`.toLowerCase();
        if (!haystack.includes(debouncedSearch)) return false;
      }
      return true;
    });
  }, [
    tickets,
    statusFilter,
    priorityFilter,
    typeFilter,
    operatorFilter,
    busFilter,
    assigneeFilter,
    onlyCritical,
    onlyLast24h,
    debouncedSearch,
  ]);

  // ─── Opciones dinámicas para los selectores ────────────────────────────────
  // Calculamos a partir de TODOS los tickets cargados (no de los filtrados),
  // así el usuario puede cambiar entre opciones sin que desaparezcan al
  // estrechar los filtros.
  const facets = useMemo(() => {
    const tipos = new Map<string, number>();
    const operators = new Map<string, number>();
    const buses = new Map<string, number>();
    const assignees = new Map<string, number>();
    let unassigned = 0;
    for (const t of tickets) {
      if (t.tipo) tipos.set(t.tipo, (tipos.get(t.tipo) ?? 0) + 1);
      if (t.operator) operators.set(t.operator, (operators.get(t.operator) ?? 0) + 1);
      if (t.busId) buses.set(t.busId, (buses.get(t.busId) ?? 0) + 1);
      if (t.assignedToUserName)
        assignees.set(t.assignedToUserName, (assignees.get(t.assignedToUserName) ?? 0) + 1);
      else unassigned += 1;
    }
    const sortByCountDesc = (a: [string, number], b: [string, number]) =>
      b[1] - a[1] || a[0].localeCompare(b[0]);
    return {
      tipos: Array.from(tipos.entries()).sort(sortByCountDesc),
      operators: Array.from(operators.entries()).sort(sortByCountDesc),
      buses: Array.from(buses.entries()).sort(sortByCountDesc),
      assignees: Array.from(assignees.entries()).sort(sortByCountDesc),
      unassignedCount: unassigned,
    };
  }, [tickets]);

  // Lista de filtros activos (para los chips de "filtros activos" y el contador).
  const activeFilters = useMemo(() => {
    const list: { key: string; label: string; clear: () => void }[] = [];
    if (statusFilter !== "activos") {
      const labels: Record<string, string> = {
        todos: "Todas",
        abierto: "Abiertas",
        en_proceso: "En proceso",
        esperando_repuesto: "Esp. rep.",
        resuelto: "Resueltas",
      };
      list.push({
        key: "status",
        label: `Estado: ${labels[statusFilter] ?? statusFilter}`,
        clear: () => setStatusFilter("activos"),
      });
    }
    if (priorityFilter !== "todos") {
      list.push({
        key: "priority",
        label: `Prioridad: ${PRIORITY_META[priorityFilter].label}`,
        clear: () => setPriorityFilter("todos"),
      });
    }
    if (typeFilter !== "todos") {
      list.push({
        key: "type",
        label: `Tipo: ${typeFilter}`,
        clear: () => setTypeFilter("todos"),
      });
    }
    if (operatorFilter !== "todos") {
      list.push({
        key: "operator",
        label: `Operadora: ${operatorFilter}`,
        clear: () => setOperatorFilter("todos"),
      });
    }
    if (busFilter !== "todos") {
      list.push({
        key: "bus",
        label: `Bus: ${busFilter}`,
        clear: () => setBusFilter("todos"),
      });
    }
    if (assigneeFilter !== "todos") {
      list.push({
        key: "assignee",
        label:
          assigneeFilter === "__sin_asignar__"
            ? "Solo sin asignar"
            : `Técnico: ${assigneeFilter}`,
        clear: () => setAssigneeFilter("todos"),
      });
    }
    if (onlyCritical)
      list.push({ key: "critical", label: "Solo críticas", clear: () => setOnlyCritical(false) });
    if (onlyLast24h)
      list.push({ key: "last24", label: "Últimas 24 h", clear: () => setOnlyLast24h(false) });
    if (debouncedSearch)
      list.push({ key: "search", label: `Búsqueda: "${debouncedSearch}"`, clear: () => setSearch("") });
    return list;
  }, [
    statusFilter,
    priorityFilter,
    typeFilter,
    operatorFilter,
    busFilter,
    assigneeFilter,
    onlyCritical,
    onlyLast24h,
    debouncedSearch,
  ]);

  const clearAllFilters = useCallback(() => {
    setStatusFilter("activos");
    setPriorityFilter("todos");
    setTypeFilter("todos");
    setOperatorFilter("todos");
    setBusFilter("todos");
    setAssigneeFilter("todos");
    setOnlyCritical(false);
    setOnlyLast24h(false);
    setSearch("");
  }, []);

  // ─── KPIs (sobre TODOS los tickets, no solo filtrados) ────────────────────
  // Calculamos un "delta vs ayer mismo periodo" sencillo para dar contexto
  // visual al usuario sin necesidad de un endpoint nuevo.
  const kpis = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const cutoff24 = now - day;
    const cutoff48 = now - 2 * day;

    let abiertas = 0;
    let enProceso = 0;
    let altas = 0;
    let last24h = 0;
    let prev24h = 0;
    for (const t of tickets) {
      if (t.status === "abierto") abiertas += 1;
      if (t.status === "en_proceso") enProceso += 1;
      if (t.priority === "alta" && t.status !== "resuelto") altas += 1;
      const created = new Date(t.createdAt).getTime();
      if (created >= cutoff24) last24h += 1;
      else if (created >= cutoff48) prev24h += 1;
    }
    return {
      abiertas,
      enProceso,
      altas,
      last24h,
      prev24h,
      total: tickets.length,
    };
  }, [tickets]);

  // ─── Agrupación temporal ───────────────────────────────────────────────────
  // Agrupamos los filtrados (ya ordenados desc por createdAt en el endpoint)
  // en 4 cubos visuales: Hoy / Ayer / Esta semana / Más antiguas. Ayuda al
  // ojo a localizar rápidamente "qué ha pasado hoy".
  const grouped = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;

    const groups: { key: string; label: string; tickets: Ticket[] }[] = [
      { key: "hoy", label: "Hoy", tickets: [] },
      { key: "ayer", label: "Ayer", tickets: [] },
      { key: "semana", label: "Esta semana", tickets: [] },
      { key: "anteriores", label: "Más antiguas", tickets: [] },
    ];
    for (const t of filtered) {
      const ts = new Date(t.createdAt).getTime();
      if (ts >= startOfToday) groups[0].tickets.push(t);
      else if (ts >= startOfYesterday) groups[1].tickets.push(t);
      else if (ts >= startOfWeek) groups[2].tickets.push(t);
      else groups[3].tickets.push(t);
    }
    return groups.filter((g) => g.tickets.length > 0);
  }, [filtered]);

  return (
    <div className={cn("space-y-4", wallboard && "space-y-5")}>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Abiertas"
          value={kpis.abiertas}
          tone="amber"
          Icon={AlertCircle}
          wallboard={wallboard}
        />
        <KpiCard
          label="En proceso"
          value={kpis.enProceso}
          tone="sky"
          Icon={Loader2}
          spin={kpis.enProceso > 0}
          wallboard={wallboard}
        />
        <KpiCard
          label="Prioridad alta"
          value={kpis.altas}
          tone="red"
          Icon={AlertTriangle}
          pulse={kpis.altas > 0}
          wallboard={wallboard}
        />
        <KpiCard
          label="Últimas 24 h"
          value={kpis.last24h}
          tone="violet"
          Icon={Clock}
          delta={kpis.last24h - kpis.prev24h}
          deltaLabel="vs día anterior"
          wallboard={wallboard}
        />
        <KpiCard
          label="Total histórico"
          value={kpis.total}
          tone="slate"
          Icon={Filter}
          wallboard={wallboard}
        />
      </div>

      {/* Controles */}
      {!wallboard ? (
        <div className="space-y-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          {/* Fila 1: Estado + prioridad + chips rápidos + búsqueda + acciones */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={statusFilter}
                onChange={(v) =>
                  setStatusFilter(v as TicketStatus | "todos" | "activos")
                }
                options={[
                  { v: "activos", label: "Activas" },
                  { v: "abierto", label: "Abiertas" },
                  { v: "en_proceso", label: "En proceso" },
                  { v: "esperando_repuesto", label: "Esp. rep." },
                  { v: "resuelto", label: "Resueltas" },
                  { v: "todos", label: "Todas" },
                ]}
              />
              <Segmented
                value={priorityFilter}
                onChange={(v) => setPriorityFilter(v as TicketPriority | "todos")}
                options={[
                  { v: "todos", label: "Cualquiera" },
                  { v: "alta", label: "Alta" },
                  { v: "media", label: "Media" },
                  { v: "baja", label: "Baja" },
                ]}
              />
              <button
                type="button"
                onClick={() => setOnlyCritical((v) => !v)}
                aria-pressed={onlyCritical}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  onlyCritical
                    ? "border-[var(--color-error)]/60 bg-[var(--color-error-light)] text-[var(--color-error)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
                )}
              >
                <AlertTriangle size={12} />
                Solo críticas
              </button>
              <button
                type="button"
                onClick={() => setOnlyLast24h((v) => !v)}
                aria-pressed={onlyLast24h}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  onlyLast24h
                    ? "border-violet-500/60 bg-violet-500/15 text-violet-300"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
                )}
              >
                <Clock size={12} />
                Últimas 24 h
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar título, bus, descripción…"
                  className="w-60 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-7 pr-3 text-[12px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
              <ConnIndicator connOk={connOk} ts={lastFetchAt} />
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                title="Refrescar ahora"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)] disabled:opacity-50"
              >
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button
                type="button"
                onClick={() => setWallboard(true)}
                title="Modo Wallboard (pantalla grande)"
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] px-2.5 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white"
              >
                <Maximize2 size={11} />
                Wallboard
              </button>
            </div>
          </div>

          {/* Fila 2: filtros granulares por tipo / operadora / bus / técnico */}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2.5">
            <FilterSelect
              Icon={Layers}
              label="Tipo"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "todos", label: "Cualquier tipo" },
                ...facets.tipos.map(([name, count]) => ({
                  value: name,
                  label: `${name} (${count})`,
                })),
              ]}
            />
            <FilterSelect
              Icon={BusIcon}
              label="Operadora"
              value={operatorFilter}
              onChange={setOperatorFilter}
              options={[
                { value: "todos", label: "Cualquier operadora" },
                ...facets.operators.map(([name, count]) => ({
                  value: name,
                  label: `${name} (${count})`,
                })),
              ]}
            />
            <FilterSelect
              Icon={BusIcon}
              label="Bus"
              value={busFilter}
              onChange={setBusFilter}
              options={[
                { value: "todos", label: "Cualquier bus" },
                ...facets.buses.map(([name, count]) => ({
                  value: name,
                  label: `${name} (${count})`,
                })),
              ]}
            />
            <FilterSelect
              Icon={UsersIcon}
              label="Técnico"
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              options={[
                { value: "todos", label: "Cualquier técnico" },
                {
                  value: "__sin_asignar__",
                  label: `Sin asignar (${facets.unassignedCount})`,
                },
                ...facets.assignees.map(([name, count]) => ({
                  value: name,
                  label: `${name} (${count})`,
                })),
              ]}
            />

            {/* Resumen y limpieza */}
            <div className="ml-auto inline-flex items-center gap-2 text-[11px] text-[var(--color-text-3)]">
              <span>
                Mostrando{" "}
                <strong className="font-semibold tabular-nums text-[var(--color-text-1)]">
                  {filtered.length}
                </strong>{" "}
                de{" "}
                <span className="tabular-nums text-[var(--color-text-2)]">
                  {tickets.length}
                </span>
              </span>
              {activeFilters.length > 0 ? (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-white"
                  title="Quitar todos los filtros activos"
                >
                  <X size={11} />
                  Limpiar {activeFilters.length} filtro
                  {activeFilters.length === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>
          </div>

          {/* Chips de filtros activos (quitables uno a uno) */}
          {activeFilters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border)] pt-2.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                Filtros activos
              </span>
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={f.clear}
                  className="group inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white"
                  title="Quitar este filtro"
                >
                  {f.label}
                  <X size={10} className="opacity-70 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <WallboardStatusBar
          connOk={connOk}
          ts={lastFetchAt}
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          onExit={() => setWallboard(false)}
          countShown={filtered.length}
          countTotal={tickets.length}
          statusFilter={statusFilter}
        />
      )}

      {/* Lista (con cabeceras de grupo) */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.03]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={cn("space-y-5", wallboard && "space-y-6")}>
          {grouped.map((group) => (
            <section key={group.key}>
              <GroupHeader label={group.label} count={group.tickets.length} />
              <ul className={cn("mt-2.5 space-y-3", wallboard && "space-y-4")}>
                <AnimatePresence initial={false}>
                  {group.tickets.map((t) => (
                    <motion.li
                      key={t.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <TicketRow
                        ticket={t}
                        expanded={expandedId === t.id}
                        onToggle={() =>
                          setExpandedId(expandedId === t.id ? null : t.id)
                        }
                        wallboard={wallboard}
                        highlight={highlightIds.has(t.id)}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Botón flotante "Ir arriba" */}
      <AnimatePresence>
        {showTop ? (
          <motion.button
            key="scroll-top"
            type="button"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title="Volver al principio"
            // bottom-24 para apilarse ENCIMA del FAB de feedback (que vive
            // en bottom-4/6 y mide ~48px). z-50 para asegurar visibilidad.
            className="fixed bottom-24 right-3 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent)] text-white shadow-2xl shadow-[var(--color-accent)]/30 hover:scale-105 active:scale-95 sm:bottom-24 sm:right-6"
          >
            <ArrowUp size={20} />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex items-center gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-2)]">
          {label}
        </h2>
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--color-surface-3)] px-1.5 text-[10.5px] font-bold tabular-nums text-[var(--color-text-2)]">
          {count}
        </span>
      </div>
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-[var(--color-border)] to-transparent" />
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  Icon,
  spin,
  pulse,
  delta,
  deltaLabel,
  wallboard,
}: {
  label: string;
  value: number;
  tone: "amber" | "sky" | "red" | "violet" | "slate";
  Icon: typeof Clock;
  spin?: boolean;
  pulse?: boolean;
  delta?: number;
  deltaLabel?: string;
  wallboard?: boolean;
}) {
  const tones = {
    amber: {
      border: "border-amber-500/30",
      bg: "bg-amber-500/[0.06]",
      ring: "ring-amber-500/20",
      icon: "text-amber-300 bg-amber-500/15",
      glow: "bg-amber-500/20",
    },
    sky: {
      border: "border-sky-500/30",
      bg: "bg-sky-500/[0.06]",
      ring: "ring-sky-500/20",
      icon: "text-sky-300 bg-sky-500/15",
      glow: "bg-sky-500/20",
    },
    red: {
      border: "border-[var(--color-error)]/40",
      bg: "bg-[var(--color-error)]/[0.08]",
      ring: "ring-[var(--color-error)]/25",
      icon: "text-[var(--color-error)] bg-[var(--color-error-light)]",
      glow: "bg-[var(--color-error)]/25",
    },
    violet: {
      border: "border-violet-500/30",
      bg: "bg-violet-500/[0.06]",
      ring: "ring-violet-500/20",
      icon: "text-violet-300 bg-violet-500/15",
      glow: "bg-violet-500/20",
    },
    slate: {
      border: "border-[var(--color-border)]",
      bg: "bg-[var(--color-surface-2)]/40",
      ring: "ring-[var(--color-border)]",
      icon: "text-[var(--color-text-2)] bg-[var(--color-surface-2)]",
      glow: "bg-white/5",
    },
  }[tone];

  const showDelta = typeof delta === "number" && delta !== 0;
  const deltaUp = typeof delta === "number" && delta > 0;

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 overflow-hidden rounded-2xl border px-4 ring-1 ring-inset",
        tones.border,
        tones.bg,
        tones.ring,
        wallboard ? "py-5 sm:gap-4 sm:px-5" : "py-4",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full blur-2xl opacity-50",
          tones.glow,
          pulse && "animate-pulse",
        )}
      />
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-2xl",
          tones.icon,
          wallboard ? "h-12 w-12" : "h-11 w-11",
        )}
      >
        <Icon
          size={wallboard ? 24 : 22}
          strokeWidth={2.2}
          className={spin ? "animate-spin" : ""}
        />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "font-semibold uppercase tracking-[0.14em] opacity-75",
            wallboard ? "text-[11px]" : "text-[10.5px]",
          )}
        >
          {label}
        </p>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <p
            className={cn(
              "font-bold leading-none tabular-nums tracking-tight text-[var(--color-text-1)]",
              wallboard ? "text-5xl sm:text-6xl" : "text-3xl sm:text-[2rem]",
            )}
          >
            {value}
          </p>
          {showDelta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                deltaUp
                  ? "bg-rose-500/15 text-rose-300"
                  : "bg-emerald-500/15 text-emerald-300",
              )}
              title={deltaLabel}
            >
              {deltaUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {Math.abs(delta)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Segmented<V extends string>({
  value,
  onChange,
  options,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { v: V; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5">
      {options.map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.v}
            type="button"
            onClick={() => onChange(opt.v)}
            className={cn(
              "rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors",
              active
                ? "bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-sm"
                : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Select estilizado con icono y label inline.
 * Reutilizado para los filtros granulares (tipo, operadora, bus, técnico).
 * Cambia de aspecto cuando el valor NO es "todos" para que el usuario vea
 * de un vistazo que ese filtro está activo.
 */
function FilterSelect({
  Icon,
  label,
  value,
  onChange,
  options,
}: {
  Icon: typeof Clock;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const active = value !== "todos";
  return (
    <label
      className={cn(
        "group relative inline-flex items-center gap-1.5 rounded-full border py-1 pl-2 pr-1 text-[11.5px] font-medium transition-colors cursor-pointer",
        active
          ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
      )}
      title={label}
    >
      <Icon size={12} strokeWidth={2.2} className="shrink-0 opacity-90" />
      <span className="hidden sm:inline">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "max-w-[160px] cursor-pointer appearance-none rounded-full bg-transparent py-0.5 pl-1 pr-5 text-[11.5px] font-semibold focus:outline-none",
          active ? "text-[var(--color-accent)]" : "text-[var(--color-text-1)]",
        )}
        style={{
          // Caret en SVG con el color actual (sigue el color del texto del select).
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.45rem center",
          backgroundSize: "0.7rem",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[var(--color-surface)] text-[var(--color-text-1)]">
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ConnIndicator({ connOk, ts }: { connOk: boolean; ts: number | null }) {
  return (
    <div
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full px-2 text-[10.5px] font-medium",
        connOk
          ? "bg-emerald-500/10 text-emerald-300"
          : "bg-[var(--color-error-light)] text-[var(--color-error)]",
      )}
      title={connOk ? "Conectado al servidor" : "Sin conexión: mostrando última copia"}
    >
      {connOk ? <Wifi size={11} /> : <WifiOff size={11} />}
      <LastFetchLabel ts={ts} />
    </div>
  );
}

function WallboardStatusBar({
  connOk,
  ts,
  refreshing,
  onRefresh,
  onExit,
  countShown,
  countTotal,
  statusFilter,
}: {
  connOk: boolean;
  ts: number | null;
  refreshing: boolean;
  onRefresh: () => void;
  onExit: () => void;
  countShown: number;
  countTotal: number;
  statusFilter: TicketStatus | "todos" | "activos";
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-3 text-xs font-bold uppercase tracking-widest text-white">
          <Eye size={13} /> Wallboard
        </span>
        <p className="text-sm font-medium text-[var(--color-text-1)]">
          Mostrando <span className="font-bold tabular-nums">{countShown}</span> de{" "}
          <span className="tabular-nums">{countTotal}</span> incidencias ·{" "}
          <span className="text-[var(--color-text-2)]">
            {statusFilter === "activos" ? "Solo activas" : "Filtro personalizado"}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <ConnIndicator connOk={connOk} ts={ts} />
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refrescar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[var(--color-text-1)] hover:bg-white/20 disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        </button>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[11px] font-semibold text-[var(--color-text-1)] hover:bg-white/20"
        >
          <Minimize2 size={12} />
          Salir
        </button>
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  expanded,
  onToggle,
  wallboard,
  highlight,
}: {
  ticket: Ticket;
  expanded: boolean;
  onToggle: () => void;
  wallboard?: boolean;
  highlight?: boolean;
}) {
  const status = STATUS_META[ticket.status];
  const priority = PRIORITY_META[ticket.priority];
  const isCritical = ticket.priority === "alta" && ticket.status !== "resuelto";

  // Antigüedad: clave para entender de un vistazo qué lleva mucho tiempo
  // abierto. Verde < 1h, amarillo < 24h, rojo > 24h. Solo se colorea si
  // el ticket NO está resuelto (los resueltos van neutros).
  const ageMs = Date.now() - new Date(ticket.createdAt).getTime();
  const ageH = ageMs / 3_600_000;
  const ageTone: "fresh" | "warm" | "hot" | "neutral" =
    ticket.status === "resuelto"
      ? "neutral"
      : ageH < 1
        ? "fresh"
        : ageH < 24
          ? "warm"
          : "hot";

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-[var(--color-surface)] shadow-sm transition-all",
        "hover:border-[var(--color-border-hover)] hover:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.45)]",
        isCritical
          ? "border-[var(--color-error)]/40 shadow-[0_0_0_1px_rgba(220,38,38,0.06),0_8px_24px_-14px_rgba(220,38,38,0.35)]"
          : "border-[var(--color-border)]",
        expanded &&
          "border-[var(--color-accent)]/40 shadow-[0_10px_30px_-12px_rgba(37,99,235,0.35)]",
        highlight && "ring-2 ring-amber-400/50 ring-offset-0",
      )}
    >
      {/* Glow rojo sutil para alta */}
      {isCritical ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-20 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-[var(--color-error)]/10 blur-3xl"
        />
      ) : null}

      {/* Badge "Nueva" flotante */}
      {highlight ? (
        <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-950 shadow-md shadow-amber-400/30">
          Nueva
        </span>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "relative flex w-full items-stretch gap-3 text-left sm:gap-4",
          wallboard ? "px-5 py-5 sm:gap-5 sm:px-6 sm:py-6" : "px-3 py-3 sm:px-4 sm:py-4",
        )}
      >
        {/* Barra de prioridad */}
        <div
          className={cn(
            "shrink-0 rounded-full",
            priority.bar,
            wallboard ? "w-[5px]" : "w-1",
          )}
          aria-hidden
        />

        {/* Avatar del bus + badges apilados */}
        <div className={cn("flex shrink-0 flex-col items-center gap-2", wallboard ? "w-20" : "w-16")}>
          <BusAvatar busId={ticket.busId} operator={ticket.operator} wallboard={wallboard} />
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ring-1 ring-inset",
              status.bg,
              status.color,
              status.ring,
              wallboard ? "text-[10.5px]" : "text-[9.5px]",
            )}
          >
            <status.Icon
              size={wallboard ? 10 : 9}
              strokeWidth={2.4}
              className={ticket.status === "en_proceso" ? "animate-spin" : ""}
            />
            {shortStatusLabel(ticket.status)}
          </span>
        </div>

        {/* Contenido principal */}
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {/* Tag de prioridad pequeño antes del título */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold uppercase tracking-wider",
                priority.bg,
                priority.color,
                wallboard ? "text-[10.5px]" : "text-[9.5px]",
              )}
            >
              <priority.Icon size={wallboard ? 11 : 10} strokeWidth={2.6} />
              {priority.label}
            </span>
            <h3
              className={cn(
                "font-semibold leading-tight text-[var(--color-text-1)]",
                wallboard ? "text-lg sm:text-xl" : "text-[15.5px] sm:text-base",
              )}
            >
              {ticket.title}
            </h3>
            <span
              className={cn(
                "font-mono text-[var(--color-text-3)]",
                wallboard ? "text-[11.5px]" : "text-[10.5px]",
              )}
            >
              {shortId(ticket.id)}
            </span>
          </header>

          <p
            className={cn(
              "mt-1 whitespace-pre-wrap leading-relaxed text-[var(--color-text-2)]",
              wallboard ? "text-[15px]" : "text-[13px]",
              !expanded && (wallboard ? "line-clamp-3" : "line-clamp-2"),
            )}
          >
            {ticket.description}
          </p>

          <div
            className={cn(
              "mt-2.5 flex flex-wrap items-center gap-1.5",
              wallboard ? "text-[12px]" : "text-[11px]",
            )}
          >
            {ticket.lineaLabel ? (
              <MetaPill Icon={MapPin}>{ticket.lineaLabel}</MetaPill>
            ) : null}
            {ticket.servicioLabel ? (
              <MetaPill>Servicio {ticket.servicioLabel}</MetaPill>
            ) : null}
            {ticket.municipio ? <MetaPill>{ticket.municipio}</MetaPill> : null}
            {ticket.assignedToUserName ? (
              <UserChip name={ticket.assignedToUserName} />
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10.5px] italic text-[var(--color-text-3)]">
                Sin asignar
              </span>
            )}
            {ticket.attachments.length > 0 ? (
              <MetaPill Icon={Paperclip}>{ticket.attachments.length}</MetaPill>
            ) : null}
            {ticket.comments.length > 0 ? (
              <MetaPill Icon={MessageCircle}>{ticket.comments.length}</MetaPill>
            ) : null}
            {/* Antigüedad coloreada — única señal a la derecha */}
            <span className="ml-auto">
              <AgePill tone={ageTone} createdAt={ticket.createdAt} />
            </span>
          </div>
        </div>

        <ChevronDown
          size={wallboard ? 20 : 16}
          className={cn(
            "mt-1 shrink-0 self-start text-[var(--color-text-3)] transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* Cuerpo expandido */}
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40"
          >
            <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
              {ticket.attachments.length > 0 ? (
                <div>
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                    Adjuntos ({ticket.attachments.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {ticket.attachments.map((a) => {
                      const isImage = a.mimeType?.startsWith("image/");
                      return (
                        <a
                          key={a.id}
                          href={a.downloadUrl ?? "#"}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="group/att block overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)]"
                          title={a.fileName}
                        >
                          {isImage && a.downloadUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={a.downloadUrl}
                              alt={a.fileName}
                              loading="lazy"
                              className="aspect-[4/3] h-full w-full object-cover transition-transform group-hover/att:scale-[1.03]"
                            />
                          ) : (
                            <div className="flex aspect-[4/3] items-center justify-center bg-[var(--color-surface-3)] px-2 text-center text-[10.5px] text-[var(--color-text-3)]">
                              <Paperclip size={14} />
                            </div>
                          )}
                          <div className="px-1.5 py-1">
                            <p
                              className="truncate text-[10.5px] text-[var(--color-text-2)]"
                              title={a.fileName}
                            >
                              {a.fileName}
                            </p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {ticket.comments.length > 0 ? (
                <div>
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                    Comentarios ({ticket.comments.length})
                  </p>
                  <ul className="space-y-1.5">
                    {ticket.comments.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[12px] font-semibold text-[var(--color-text-1)]">
                            {c.author}
                          </span>
                          <span className="text-[10.5px] text-[var(--color-text-3)]">
                            {relativeOrAbsolute(c.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--color-text-2)]">
                          {c.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {ticket.attachments.length === 0 && ticket.comments.length === 0 ? (
                <p className="text-[12px] italic text-[var(--color-text-3)]">
                  Sin adjuntos ni comentarios todavía.
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

// ─── Mini-componentes visuales ───────────────────────────────────────────────

/** Avatar redondo del bus con color por operadora + código grande. */
function BusAvatar({
  busId,
  operator,
  wallboard,
}: {
  busId: string;
  operator: string;
  wallboard?: boolean;
}) {
  const hue = hashHue(operator);
  const size = wallboard ? 56 : 48;
  return (
    <div
      className="relative flex items-center justify-center rounded-2xl ring-2 ring-inset"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsla(${hue}, 65%, 55%, 0.22), hsla(${hue}, 65%, 45%, 0.10))`,
        boxShadow: `inset 0 0 0 1px hsla(${hue}, 60%, 55%, 0.35)`,
        // @ts-expect-error CSS custom var ok aquí
        "--tw-ring-color": `hsla(${hue}, 65%, 55%, 0.25)`,
      }}
      title={`Bus ${busId} · ${operator}`}
    >
      <div className="flex flex-col items-center gap-0">
        <BusIcon
          size={wallboard ? 13 : 11}
          className="opacity-90"
          style={{ color: `hsl(${hue}, 70%, 75%)` }}
        />
        <span
          className={cn(
            "font-bold leading-tight tabular-nums tracking-tight",
            wallboard ? "text-[13px]" : "text-[11.5px]",
          )}
          style={{ color: `hsl(${hue}, 80%, 88%)` }}
        >
          {shortBusLabel(busId)}
        </span>
      </div>
    </div>
  );
}

/** Chip con iniciales del técnico asignado + su nombre. */
function UserChip({ name }: { name: string }) {
  const initials = initialsOf(name);
  const hue = hashHue(name);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] py-0.5 pl-0.5 pr-2 text-[10.5px] text-[var(--color-text-2)]">
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full text-[8.5px] font-bold leading-none text-white"
        style={{
          background: `linear-gradient(135deg, hsl(${hue},65%,55%), hsl(${(hue + 30) % 360},65%,45%))`,
        }}
        aria-hidden
      >
        {initials}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Pill de antigüedad coloreada por urgencia. */
function AgePill({
  tone,
  createdAt,
}: {
  tone: "fresh" | "warm" | "hot" | "neutral";
  createdAt: string;
}) {
  const cls =
    tone === "hot"
      ? "bg-[var(--color-error-light)] text-[var(--color-error)] border-[var(--color-error)]/40"
      : tone === "warm"
        ? "bg-amber-500/12 text-amber-300 border-amber-500/40"
        : tone === "fresh"
          ? "bg-emerald-500/12 text-emerald-300 border-emerald-500/40"
          : "bg-transparent text-[var(--color-text-3)] border-transparent";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold",
        cls,
      )}
      title={new Date(createdAt).toLocaleString("es-ES")}
    >
      <Clock size={10} strokeWidth={2.4} />
      {relativeOrAbsolute(createdAt)}
    </span>
  );
}

function MetaPill({
  Icon,
  children,
}: {
  Icon?: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)]/70 bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-text-2)]">
      {Icon ? <Icon size={11} strokeWidth={2} className="opacity-80" /> : null}
      {children}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-6 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
        <CheckCircle2 size={20} className="text-emerald-300" />
      </span>
      <p className="text-sm font-medium text-[var(--color-text-1)]">
        Sin incidencias con esos filtros
      </p>
      <p className="mt-1 max-w-sm text-[12px] text-[var(--color-text-3)]">
        Cambia los filtros o quítalos para ver el listado completo.
      </p>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function LastFetchLabel({ ts }: { ts: number | null }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  if (!ts) return <span>—</span>;
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5) return <span>Ahora mismo</span>;
  if (sec < 60) return <span>Hace {sec}s</span>;
  return <span>Hace {Math.floor(sec / 60)} min</span>;
}

function relativeOrAbsolute(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "ahora mismo";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Genera un hue determinístico a partir de un string. Sirve para asignar
 *  el mismo color a la misma operadora/persona en toda la app. */
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 360;
}

function shortStatusLabel(s: TicketStatus): string {
  if (s === "esperando_repuesto") return "Esp. rep.";
  if (s === "en_proceso") return "Proceso";
  return STATUS_META[s].label;
}

/** El bus suele venir como "GL-1662" o similar. Mostramos solo el sufijo
 *  numérico (4 dígitos) para no saturar el avatar. Si no encaja, devolvemos
 *  los últimos 4 caracteres. */
function shortBusLabel(busId: string): string {
  const m = busId.match(/(\d{2,5})$/);
  if (m) return m[1];
  return busId.slice(-4);
}

/** El ID del ticket es muy largo (cmpxxx...). Mostramos solo los últimos 5
 *  caracteres prefijados con "#" para que sea identificable pero compacto. */
function shortId(id: string): string {
  return `#${id.slice(-5)}`;
}
