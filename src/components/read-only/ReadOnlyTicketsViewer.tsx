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

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  Building2,
  Bus as BusIcon,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState as UiEmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { KpiPill, type KpiTone } from "@/components/ui/kpi-pill";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FilterActiveTag,
  FilterDivider,
  FilterLabeledGroup,
  FilterPillToggle,
  FilterPills,
  FilterSelect,
} from "@/components/ui/ticket-filter-bar";

function ticketStaggerClass(index: number) {
  return `ccmgc-stagger-in ccmgc-stagger-in-${(index % 6) + 1}`;
}

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
  { label: string; badge: "warning" | "info" | "neutral" | "success"; Icon: typeof CheckCircle2 }
> = {
  abierto: { label: "Abierto", badge: "warning", Icon: AlertCircle },
  en_proceso: { label: "En proceso", badge: "info", Icon: Loader2 },
  esperando_repuesto: { label: "Esperando repuesto", badge: "neutral", Icon: Clock },
  resuelto: { label: "Resuelto", badge: "success", Icon: CheckCircle2 },
};

const PRIORITY_META: Record<
  TicketPriority,
  { label: string; badge: "error" | "warning" | "success"; bar: string; Icon: typeof AlertTriangle }
> = {
  alta: {
    label: "Alta",
    badge: "error",
    bar: "bg-gradient-to-b from-[var(--color-error)] to-[color-mix(in_oklab,var(--color-error)_60%,transparent)]",
    Icon: AlertTriangle,
  },
  media: {
    label: "Media",
    badge: "warning",
    bar: "bg-gradient-to-b from-[var(--color-warning)] to-[color-mix(in_oklab,var(--color-warning)_60%,transparent)]",
    Icon: AlertCircle,
  },
  baja: {
    label: "Baja",
    badge: "success",
    bar: "bg-gradient-to-b from-[var(--color-success)] to-[color-mix(in_oklab,var(--color-success)_50%,transparent)]",
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
  const [loadError, setLoadError] = useState<string | null>(null);
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
        setLoadError(null);
      } catch (err) {
        console.warn("ReadOnlyTicketsViewer:", err);
        setConnOk(false);
        if (!silent) setLoadError("No se pudieron cargar las incidencias");
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
        <LecturaKpi label="Abiertas" value={kpis.abiertas} tone="warning" icon={<AlertCircle size={12} aria-hidden />} wallboard={wallboard} animateValue={!loading} />
        <LecturaKpi label="En proceso" value={kpis.enProceso} tone="info" icon={<Loader2 size={12} aria-hidden className={kpis.enProceso > 0 ? "animate-spin" : ""} />} wallboard={wallboard} animateValue={!loading} />
        <LecturaKpi label="Prioridad alta" value={kpis.altas} tone="error" icon={<AlertTriangle size={12} aria-hidden />} pulse={kpis.altas > 0} wallboard={wallboard} animateValue={!loading} />
        <LecturaKpi label="Últimas 24 h" value={kpis.last24h} tone="violet" icon={<Clock size={12} aria-hidden />} delta={kpis.last24h - kpis.prev24h} deltaLabel="vs día anterior" wallboard={wallboard} animateValue={!loading} />
        <LecturaKpi label="Total histórico" value={kpis.total} tone="neutral" icon={<Filter size={12} aria-hidden />} wallboard={wallboard} animateValue={!loading} />
      </div>

      {/* Controles — barra plana sin cajas anidadas */}
      {!wallboard ? (
        <div className="sticky top-0 z-20 space-y-3 rounded-xl bg-[color-mix(in_oklab,var(--color-bg)_88%,transparent)] py-2 backdrop-blur-md supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--color-bg)_78%,transparent)]">
          {/* Búsqueda + acciones */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-[var(--color-text-3)]"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar título, bus, descripción…"
                className="h-9 w-full rounded-lg border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-9 pr-3 text-[12.5px] shadow-sm"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <ConnIndicator connOk={connOk} ts={lastFetchAt} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void load(true)}
                disabled={refreshing}
                title="Refrescar ahora"
                aria-label="Refrescar ahora"
                className="!h-8 !w-8 !min-h-0 !rounded-lg !p-0"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setWallboard(true)}
                title="Modo Wallboard (pantalla grande)"
                className="!h-8 gap-1.5 !rounded-lg !px-2.5 text-[10.5px] font-semibold"
                startIcon={<Maximize2 size={11} />}
              >
                Wallboard
              </Button>
            </div>
          </div>

          {/* Estado + prioridad + atajos */}
          <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-5 lg:gap-y-2">
            <FilterLabeledGroup label="Estado">
              <FilterPills
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as TicketStatus | "todos" | "activos")}
                options={[
                  { v: "activos", label: "Activas" },
                  { v: "abierto", label: "Abiertas" },
                  { v: "en_proceso", label: "En proceso" },
                  { v: "esperando_repuesto", label: "Esp. rep." },
                  { v: "resuelto", label: "Resueltas" },
                  { v: "todos", label: "Todas" },
                ]}
              />
            </FilterLabeledGroup>

            <FilterDivider className="hidden lg:block" />

            <FilterLabeledGroup label="Prioridad">
              <FilterPills
                value={priorityFilter}
                onChange={(v) => setPriorityFilter(v as TicketPriority | "todos")}
                options={[
                  { v: "todos", label: "Cualquiera" },
                  { v: "alta", label: "Alta" },
                  { v: "media", label: "Media" },
                  { v: "baja", label: "Baja" },
                ]}
              />
            </FilterLabeledGroup>

            <FilterDivider className="hidden lg:block" />

            <FilterLabeledGroup label="Atajos">
              <div className="flex flex-wrap gap-0.5">
                <FilterPillToggle
                  pressed={onlyCritical}
                  onClick={() => setOnlyCritical((v) => !v)}
                  accent="error"
                >
                  <AlertTriangle size={11} aria-hidden />
                  Solo críticas
                </FilterPillToggle>
                <FilterPillToggle pressed={onlyLast24h} onClick={() => setOnlyLast24h((v) => !v)}>
                  <Clock size={11} aria-hidden />
                  Últimas 24 h
                </FilterPillToggle>
              </div>
            </FilterLabeledGroup>
          </div>

          {/* Refinamiento: selects en una sola franja */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-[var(--color-surface-2)]/40 px-3 py-2">
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
              Icon={Building2}
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

            <div className="ml-auto inline-flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-3)]">
              <span>
                Mostrando{" "}
                <strong className="font-semibold tabular-nums text-[var(--color-text-1)]">
                  {filtered.length}
                </strong>{" "}
                de{" "}
                <span className="tabular-nums text-[var(--color-text-2)]">{tickets.length}</span>
              </span>
              {activeFilters.length > 0 ? (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/10"
                  title="Quitar todos los filtros activos"
                >
                  <X size={11} aria-hidden />
                  Limpiar
                </button>
              ) : null}
            </div>
          </div>

          {/* Tags activos — solo cuando hay filtros extra */}
          {activeFilters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {activeFilters.map((f) => (
                <FilterActiveTag key={f.key} label={f.label} onClear={f.clear} />
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
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : loadError && tickets.length === 0 ? (
        <ErrorState
          icon={WifiOff}
          title="Sin conexión con el servidor"
          hint={loadError}
          onRetry={() => void load(false)}
        />
      ) : filtered.length === 0 ? (
        <UiEmptyState
          icon={CheckCircle2}
          title="Sin incidencias con esos filtros"
          hint="Cambia los filtros o quítalos para ver el listado completo."
          actionLabel={activeFilters.length > 0 ? "Limpiar filtros" : undefined}
          onAction={activeFilters.length > 0 ? clearAllFilters : undefined}
        />
      ) : (
        <div className={cn("space-y-5", wallboard && "space-y-6")}>
          {grouped.map((group, groupIdx) => {
            const ticketsBefore = grouped.slice(0, groupIdx).reduce((n, g) => n + g.tickets.length, 0);
            return (
            <section key={group.key}>
              <GroupHeader label={group.label} count={group.tickets.length} />
              <ul className={cn("mt-2.5 space-y-3", wallboard && "space-y-4")}>
                <AnimatePresence initial={false}>
                  {group.tickets.map((t, ticketIdx) => (
                    <motion.li
                      key={t.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className={ticketStaggerClass(ticketsBefore + ticketIdx)}
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
            );
          })}
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
      <SectionEyebrow className="!mb-0 shrink-0">
        {label}
        <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--color-surface-3)] px-1.5 text-[10.5px] font-bold tabular-nums text-[var(--color-text-2)]">
          {count}
        </span>
      </SectionEyebrow>
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-[var(--color-border)] to-transparent" />
    </div>
  );
}

function LecturaKpi({
  label,
  value,
  tone,
  icon,
  pulse,
  delta,
  deltaLabel,
  wallboard,
  animateValue,
}: {
  label: string;
  value: number;
  tone: KpiTone;
  icon: React.ReactNode;
  pulse?: boolean;
  delta?: number;
  deltaLabel?: string;
  wallboard?: boolean;
  animateValue?: boolean;
}) {
  if (!wallboard) {
    return (
      <KpiPill
        layout="stacked"
        label={label}
        value={value}
        tone={tone}
        icon={icon}
        pulse={pulse}
        animateValue={animateValue}
        className="min-h-[88px]"
      />
    );
  }

  const showDelta = typeof delta === "number" && delta !== 0;
  const deltaUp = typeof delta === "number" && delta > 0;
  const toneRing =
    tone === "error"
      ? "ring-[var(--color-error)]/25 border-[color-mix(in_oklab,var(--color-error)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-error)_8%,var(--color-surface))]"
      : tone === "warning"
        ? "ring-[var(--color-warning)]/25 border-[color-mix(in_oklab,var(--color-warning)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-warning)_8%,var(--color-surface))]"
        : tone === "success"
          ? "ring-[var(--color-success)]/25 border-[color-mix(in_oklab,var(--color-success)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-success)_8%,var(--color-surface))]"
          : tone === "info" || tone === "accent"
            ? "ring-[var(--color-accent)]/25 border-[color-mix(in_oklab,var(--color-accent)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-accent)_8%,var(--color-surface))]"
            : tone === "violet"
              ? "ring-[#a855f7]/25 border-[color-mix(in_oklab,#a855f7_30%,transparent)] bg-[color-mix(in_oklab,#a855f7_8%,var(--color-surface))]"
              : "ring-[var(--color-border)] border-[var(--color-border)] bg-[var(--color-surface-2)]/40";

  return (
    <div className={cn("relative flex items-center gap-4 overflow-hidden rounded-2xl border px-5 py-5 ring-1 ring-inset", toneRing)}>
      {pulse ? (
        <span aria-hidden className="ccmgc-pulse-dot pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-[var(--color-error)]/20 blur-2xl opacity-50" />
      ) : null}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface-2)] text-[var(--color-text-2)]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-3)]">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <p className="text-5xl font-bold leading-none tabular-nums tracking-tight text-[var(--color-text-1)] sm:text-6xl">
            {value}
          </p>
          {showDelta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                deltaUp
                  ? "bg-[var(--color-error-light)] text-[var(--color-error)]"
                  : "bg-[var(--color-success-light)] text-[var(--color-success)]",
              )}
              title={deltaLabel}
            >
              {deltaUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {Math.abs(delta!)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ConnIndicator({ connOk, ts }: { connOk: boolean; ts: number | null }) {
  return (
    <div
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full px-2 text-[10.5px] font-medium",
        connOk
          ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
          : "bg-[var(--color-error-light)] text-[var(--color-error)]",
      )}
      title={connOk ? "Conectado al servidor" : "Sin conexión: mostrando última copia"}
    >
      {connOk ? <Wifi size={11} aria-hidden /> : <WifiOff size={11} aria-hidden />}
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refrescar"
          className="!h-8 !w-8 !min-h-0 !rounded-full !p-0"
          aria-label="Refrescar"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onExit}
          className="!h-8 !rounded-full !px-3 text-[11px] font-semibold"
          startIcon={<Minimize2 size={12} />}
        >
          Salir
        </Button>
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
        highlight && "ring-2 ring-[color-mix(in_oklab,var(--color-warning)_50%,transparent)] ring-offset-0",
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
        <Badge variant="warning" className="absolute right-3 top-3 z-10 uppercase tracking-widest shadow-md">
          Nueva
        </Badge>
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
          <Badge
            variant={status.badge}
            className={cn("inline-flex items-center gap-1", wallboard ? "text-[10.5px]" : "text-[9.5px]")}
          >
            <status.Icon
              size={wallboard ? 10 : 9}
              strokeWidth={2.4}
              className={ticket.status === "en_proceso" ? "animate-spin" : ""}
              aria-hidden
            />
            {shortStatusLabel(ticket.status)}
          </Badge>
        </div>

        {/* Contenido principal */}
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {/* Tag de prioridad pequeño antes del título */}
            <Badge
              variant={priority.badge}
              className={cn("inline-flex items-center gap-1 uppercase tracking-wider", wallboard ? "text-[10.5px]" : "text-[9.5px]")}
            >
              <priority.Icon size={wallboard ? 11 : 10} strokeWidth={2.6} aria-hidden />
              {priority.label}
            </Badge>
            <h3
              className={cn(
                "font-semibold leading-tight text-[var(--color-text-1)]",
                wallboard ? "text-lg sm:text-xl" : "text-[15.5px] sm:text-base",
              )}
            >
              <Link
                href={`/tickets/${ticket.id}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-sm transition-colors hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              >
                {ticket.title}
              </Link>
            </h3>
            <span
              className={cn(
                "font-mono text-[var(--color-text-3)]",
                wallboard ? "text-[11.5px]" : "text-[10.5px]",
              )}
            >
              <Link
                href={`/tickets/${ticket.id}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded px-0.5 transition-colors hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                title="Abrir detalle completo del ticket"
              >
                {shortId(ticket.id)}
              </Link>
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

        <div className="flex shrink-0 flex-col items-end gap-2 self-start pt-0.5">
          <Link
            href={`/tickets/${ticket.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-accent)]/35 bg-[var(--color-accent-light)]/50 px-2 py-1 text-[10px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
          >
            <ExternalLink size={10} aria-hidden />
            Detalle
          </Link>
          <ChevronDown
            size={wallboard ? 20 : 16}
            className={cn(
              "text-[var(--color-text-3)] transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </div>
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
              <Link
                href={`/tickets/${ticket.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-accent)]/35 bg-[var(--color-accent-light)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
              >
                <ExternalLink size={12} aria-hidden />
                Ver detalle completo
              </Link>

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
      ? "bg-[var(--color-error-light)] text-[var(--color-error)] border-[color-mix(in_oklab,var(--color-error)_40%,transparent)]"
      : tone === "warm"
        ? "bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[color-mix(in_oklab,var(--color-warning)_40%,transparent)]"
        : tone === "fresh"
          ? "bg-[var(--color-success-light)] text-[var(--color-success)] border-[color-mix(in_oklab,var(--color-success)_40%,transparent)]"
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
