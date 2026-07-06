"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  Columns3,
  List,
  ListTree,
  Moon,
  NotebookPen,
  Pin,
  RefreshCw,
  Search,
  Sunrise,
  Sunset,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  BitacoraNewEntryButton,
  BitacoraPageShell,
  BitacoraStat,
} from "@/components/bitacora/BitacoraUi";
import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { EmptyState } from "@/components/ui/empty-state";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { MenuSelect } from "@/components/ui/menu-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  entryDisplayTitle,
  entryExcerpt,
  formatBitacoraTime,
  formatShiftDateHuman,
  initials,
  KIND_META,
  shiftBadgeLabel,
  tipTapInlineParts,
  truncateInlineParts,
  type BitacoraEntry,
  type BitacoraKind,
  type TipTapInlinePart,
} from "@/lib/bitacora-shared";
import {
  currentShiftNow,
  formatRelativeShort,
  SHIFT_LABEL,
  shiftWindowLabel,
  todayYmd,
  type ShiftKey,
} from "@/lib/shift-utils";
import { cn } from "@/lib/utils";

const SHIFT_ICONS = { M: Sunrise, T: Sunset, N: Moon } as const;

type ViewMode = "lista" | "turno" | "kanban" | "agrupada";
const VIEW_STORAGE_KEY = "ccmgc_bitacora_view";
const SHIFT_ORDER: ShiftKey[] = ["M", "T", "N"];

const VIEW_OPTIONS: { id: ViewMode; label: string; icon: typeof List; title: string }[] = [
  { id: "lista", label: "Lista", icon: List, title: "Todas las notas recientes" },
  { id: "turno", label: "Turno", icon: CalendarDays, title: "Día del turno con actividad por hora" },
  { id: "kanban", label: "Kanban", icon: Columns3, title: "Por tipo: nota, alerta, pendiente" },
  { id: "agrupada", label: "Por turno", icon: ListTree, title: "Agrupado mañana / tarde / noche" },
];

function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function BitacoraIndex() {
  const router = useRouter();
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "lista";
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "lista" || saved === "turno" || saved === "kanban" || saved === "agrupada") return saved;
    return "lista";
  });
  const [shiftDate, setShiftDate] = useState(todayYmd);
  const [shiftFilter, setShiftFilter] = useState<ShiftKey | "">("");
  const [kindFilter, setKindFilter] = useState<BitacoraKind | "">("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [entries, setEntries] = useState<BitacoraEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [refreshOk, setRefreshOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeShift = currentShiftNow();
  const ShiftIcon = SHIFT_ICONS[activeShift];
  const dayScoped = viewMode === "turno" || viewMode === "agrupada";

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    if (mode === "turno" || mode === "agrupada") {
      setShiftDate((d) => d || todayYmd());
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const hasActiveFilters = Boolean(shiftFilter || kindFilter || debouncedSearch);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else if (debouncedSearch !== search.trim()) setSearching(true);
    else setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (dayScoped && shiftDate) q.set("shiftDate", shiftDate);
      if (shiftFilter) q.set("shift", shiftFilter);
      if (kindFilter) q.set("kind", kindFilter);
      if (debouncedSearch) q.set("q", debouncedSearch);
      q.set("take", viewMode === "lista" ? "100" : "80");
      const res = await fetch(`/api/bitacora?${q.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo cargar la bitácora");
      const data = (await res.json()) as { entries: BitacoraEntry[] };
      setEntries(data.entries ?? []);
      if (manual) {
        setRefreshOk(true);
        window.setTimeout(() => setRefreshOk(false), 1600);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setSearching(false);
    }
  }, [dayScoped, shiftDate, shiftFilter, kindFilter, debouncedSearch, search, viewMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const alerta = entries.filter((e) => e.kind === "alerta").length;
    const pendiente = entries.filter((e) => e.kind === "pendiente").length;
    return { total: entries.length, alerta, pendiente };
  }, [entries]);

  const pinnedEntries = useMemo(() => entries.filter((e) => e.pinned), [entries]);
  const listEntries = useMemo(() => entries.filter((e) => !e.pinned), [entries]);
  const entriesByDate = useMemo(() => groupEntriesByDate(listEntries), [listEntries]);
  const entriesByShift = useMemo(() => groupEntriesByShift(listEntries), [listEntries]);
  const kanbanEntries = useMemo(
    () => ({
      nota: entries.filter((e) => e.kind === "nota" && !e.pinned),
      alerta: entries.filter((e) => e.kind === "alerta" && !e.pinned),
      pendiente: entries.filter((e) => e.kind === "pendiente" && !e.pinned),
    }),
    [entries],
  );
  const shiftTimeline = useMemo(() => {
    const hours =
      activeShift === "M"
        ? [6, 7, 8, 9, 10, 11, 12, 13]
        : activeShift === "T"
          ? [14, 15, 16, 17, 18, 19, 20, 21]
          : [22, 23, 0, 1, 2, 3, 4, 5];
    const counts = new Map<number, number>();
    for (const h of hours) counts.set(h, 0);
    for (const e of entries) {
      if (e.shift !== activeShift) continue;
      const hour = new Date(e.createdAt).getHours();
      if (!counts.has(hour)) continue;
      counts.set(hour, (counts.get(hour) ?? 0) + 1);
    }
    return hours.map((h) => ({ hour: h, count: counts.get(h) ?? 0 }));
  }, [entries, activeShift]);

  const clearFilters = () => {
    setShiftFilter("");
    setKindFilter("");
    setSearch("");
  };

  return (
    <BitacoraPageShell className={cn(viewMode === "kanban" ? "max-w-5xl" : "max-w-3xl")}>
      <div className="b-log-home">
        <header className="b-log-home__header">
          <div className="b-log-home__header-main">
            <h1 className="b-log-home__title">Bitácora de turno</h1>
            <div className="b-log-home__stats-row mt-3 flex flex-wrap items-end gap-4">
              <BitacoraStat label="Entradas" value={stats.total} />
              <BitacoraStat label="Alertas" value={stats.alerta} tone="error" />
              <BitacoraStat label="Pendientes" value={stats.pendiente} tone="warning" />
            </div>
          </div>

          <div className="b-log-home__header-actions">
            <div className="b-log-home__shift is-live" title="Turno en curso">
              <ShiftIcon size={15} strokeWidth={2} aria-hidden />
              <span>
                {SHIFT_LABEL[activeShift]} · {shiftWindowLabel(activeShift)}
              </span>
            </div>
            <BitacoraNewEntryButton onClick={() => router.push("/bitacora/nueva")} />
            <FeedbackTargetButton id="bitacora" label="Bitácora de turno" />
          </div>
        </header>

        <div className="b-log-home__filters-card b-log-home__filters">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div
              role="tablist"
              aria-label="Modo de vista"
              className="b-log-view-toggle inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] p-0.5"
            >
              {VIEW_OPTIONS.map(({ id, label, icon: Icon, title }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === id}
                  title={title}
                  onClick={() => setViewMode(id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                    viewMode === id
                      ? "bg-[var(--color-accent)] text-white shadow-sm"
                      : "text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
                  )}
                >
                  <Icon size={11} strokeWidth={2} aria-hidden />
                  <span className="hidden min-[420px]:inline">{label}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[var(--color-text-3)]">
              {viewMode === "lista"
                ? "Mostrando las últimas notas"
                : dayScoped
                  ? formatShiftDateHuman(shiftDate)
                  : null}
            </p>
          </div>
          <div className="b-log-home__search-wrap">
            <Search size={15} className="b-log-home__search-icon" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título o autor…"
              className="b-log-input b-log-home__search"
              aria-label="Buscar"
            />
            {searching ? (
              <span className="b-log-home__search-status" aria-live="polite">
                Buscando…
              </span>
            ) : null}
          </div>
          <div className="b-log-home__filters-row">
            {dayScoped ? (
              <DatePickerField
                compact
                value={shiftDate}
                onChange={setShiftDate}
                className="b-log-home__filter-date"
                ariaLabel="Fecha del turno"
              />
            ) : null}
            <MenuSelect
              value={shiftFilter}
              onChange={(value) => setShiftFilter(value as ShiftKey | "")}
              options={[
                { value: "", label: "Todos los turnos" },
                { value: "M", label: "Mañana" },
                { value: "T", label: "Tarde" },
                { value: "N", label: "Noche" },
              ]}
              placeholder="Todos los turnos"
              className="b-log-home__filter-select b-log-home__filter-select--shift"
              buttonClassName="b-log-input"
              aria-label="Turno"
            />
            <MenuSelect
              value={kindFilter}
              onChange={(value) => setKindFilter(value as BitacoraKind | "")}
              options={[
                { value: "", label: "Todos los tipos" },
                { value: "nota", label: "Notas" },
                { value: "alerta", label: "Alertas" },
                { value: "pendiente", label: "Pendientes" },
              ]}
              placeholder="Todos los tipos"
              className="b-log-home__filter-select b-log-home__filter-select--kind"
              buttonClassName="b-log-input"
              aria-label="Tipo"
            />
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void load(true)}
              className="b-log-home__refresh"
              title="Actualizar"
              aria-label="Actualizar"
            >
              <RefreshCw size={15} className={cn(refreshing && "animate-spin")} aria-hidden />
            </button>
          </div>
        </div>

        {viewMode === "turno" ? (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
              Turno actual · {SHIFT_LABEL[activeShift]}
            </p>
            <span className="text-[10px] text-[var(--color-text-3)]">Entradas por hora</span>
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {shiftTimeline.map(({ hour, count }) => (
              <div key={hour} className="space-y-1">
                <div className="h-8 overflow-hidden rounded-md bg-[var(--color-surface)]">
                  <div
                    className="h-full rounded-md bg-[var(--color-accent)]/70 transition-all"
                    style={{ height: `${Math.min(100, Math.max(16, count * 32))}%`, transformOrigin: "bottom" }}
                  />
                </div>
                <p className="text-center text-[10px] text-[var(--color-text-3)]">
                  {String(hour).padStart(2, "0")}
                </p>
              </div>
            ))}
          </div>
        </section>
        ) : null}

        {refreshOk ? <p className="b-log-alert b-log-alert--success">Listado actualizado</p> : null}

        {hasActiveFilters ? (
          <div className="b-log-filter-chips">
            {debouncedSearch ? (
              <button type="button" className="b-log-filter-chip" onClick={() => setSearch("")}>
                «{debouncedSearch}» <X size={12} aria-hidden />
              </button>
            ) : null}
            {shiftFilter ? (
              <button type="button" className="b-log-filter-chip" onClick={() => setShiftFilter("")}>
                {SHIFT_LABEL[shiftFilter]} <X size={12} aria-hidden />
              </button>
            ) : null}
            {kindFilter ? (
              <button type="button" className="b-log-filter-chip" onClick={() => setKindFilter("")}>
                {KIND_META[kindFilter].label} <X size={12} aria-hidden />
              </button>
            ) : null}
            <button type="button" className="b-log-filter-chip" onClick={clearFilters}>
              Limpiar todo
            </button>
          </div>
        ) : null}

        {error ? <p className="b-log-alert b-log-alert--error">{error}</p> : null}

        {loading ? (
          <div className="b-log-feed b-log-feed--loading">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="b-log-feed__skeleton">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title={hasActiveFilters ? "Nada coincide con los filtros" : "La bitácora está en blanco"}
            hint={
              hasActiveFilters
                ? "Prueba otro criterio o limpia los filtros."
                : viewMode === "lista"
                  ? "Crea la primera entrada para dejar constancia del turno."
                  : "Crea la primera entrada para el siguiente turno."
            }
            actionLabel={hasActiveFilters ? "Limpiar filtros" : "Escribir primera entrada"}
            onAction={() => (hasActiveFilters ? clearFilters() : router.push("/bitacora/nueva"))}
          />
        ) : (
          <BitacoraEntriesBody
            viewMode={viewMode}
            pinnedEntries={pinnedEntries}
            listEntries={listEntries}
            entriesByDate={entriesByDate}
            entriesByShift={entriesByShift}
            kanbanEntries={kanbanEntries}
            shiftDate={shiftDate}
            shiftFilter={shiftFilter}
          />
        )}
      </div>
    </BitacoraPageShell>
  );
}

function PinnedSection({ entries }: { entries: BitacoraEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="b-log-feed-section">
      <h2 className="b-log-feed-section__title">
        <Pin size={13} aria-hidden />
        Fijadas
      </h2>
      <div className="b-log-feed">
        {entries.map((entry) => (
          <FeedRow key={entry.id} entry={entry} pinned />
        ))}
      </div>
    </section>
  );
}

function BitacoraEntriesBody({
  viewMode,
  pinnedEntries,
  listEntries,
  entriesByDate,
  entriesByShift,
  kanbanEntries,
  shiftDate,
  shiftFilter,
}: {
  viewMode: ViewMode;
  pinnedEntries: BitacoraEntry[];
  listEntries: BitacoraEntry[];
  entriesByDate: Array<[string, BitacoraEntry[]]>;
  entriesByShift: Array<{ shift: ShiftKey; entries: BitacoraEntry[] }>;
  kanbanEntries: Record<BitacoraKind, BitacoraEntry[]>;
  shiftDate: string;
  shiftFilter: ShiftKey | "";
}) {
  if (viewMode === "kanban") {
    return (
      <div className="b-log-feed-wrap space-y-4">
        <PinnedSection entries={pinnedEntries} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(["nota", "alerta", "pendiente"] as BitacoraKind[]).map((kind) => (
            <KanbanColumn key={kind} kind={kind} entries={kanbanEntries[kind]} />
          ))}
        </div>
      </div>
    );
  }

  if (viewMode === "agrupada") {
    return (
      <div className="b-log-feed-wrap">
        <PinnedSection entries={pinnedEntries} />
        {entriesByShift.length === 0 ? null : (
          entriesByShift.map(({ shift, entries }) => {
            const ShiftIcon = SHIFT_ICONS[shift];
            return (
              <section key={shift} className="b-log-feed-section">
                <div className="b-log-feed-section__head">
                  <h2 className="b-log-feed-section__title">
                    <ShiftIcon size={13} aria-hidden />
                    {SHIFT_LABEL[shift]}
                  </h2>
                  <span className="b-log-feed-section__date">{shiftWindowLabel(shift)}</span>
                </div>
                <div className="b-log-feed">
                  {entries.map((entry) => (
                    <FeedRow key={entry.id} entry={entry} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    );
  }

  if (viewMode === "turno") {
    return (
      <div className="b-log-feed-wrap">
        <PinnedSection entries={pinnedEntries} />
        <section className="b-log-feed-section">
          <div className="b-log-feed-section__head">
            <h2 className="b-log-feed-section__title">Entradas del día</h2>
            <span className="b-log-feed-section__date">
              {formatShiftDateHuman(shiftDate)}
              {shiftFilter ? ` · ${SHIFT_LABEL[shiftFilter]}` : ""}
            </span>
          </div>
          <div className="b-log-feed">
            {listEntries.map((entry) => (
              <FeedRow key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="b-log-feed-wrap">
      <PinnedSection entries={pinnedEntries} />
      {entriesByDate.map(([date, items]) => (
        <section key={date} className="b-log-feed-section">
          <div className="b-log-feed-section__head">
            <h2 className="b-log-feed-section__title">{formatShiftDateHuman(date)}</h2>
            <span className="b-log-feed-section__date">
              {items.length} entrada{items.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="b-log-feed">
            {items.map((entry) => (
              <FeedRow key={entry.id} entry={entry} showDate={false} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function KanbanColumn({ kind, entries }: { kind: BitacoraKind; entries: BitacoraEntry[] }) {
  const meta = KIND_META[kind];
  const KindIcon = meta.icon;
  return (
    <section className="b-log-kanban-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/35 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", meta.chip, "rounded-md px-2 py-0.5")}>
          <KindIcon size={12} strokeWidth={2.25} aria-hidden />
          {meta.label}
        </span>
        <span className="rounded-full bg-[var(--color-surface-3)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--color-text-2)]">
          {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] px-2 py-3 text-center text-xs text-[var(--color-text-3)]">
          Sin entradas
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <KanbanCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

function KanbanCard({ entry }: { entry: BitacoraEntry }) {
  const title = entryDisplayTitle(entry);
  const href = `/bitacora/${entry.id}`;
  return (
    <Link
      href={href}
      className={cn(
        "b-log-kanban-card block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 transition-colors hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-surface-2)]",
        entry.pinned && "ring-1 ring-[var(--color-accent)]/25",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
          {SHIFT_LABEL[entry.shift]}
        </span>
        {entry.pinned ? <Pin size={10} className="text-[var(--color-accent)]" aria-hidden /> : null}
      </div>
      <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--color-text-1)]">{title}</h3>
      <p className="mt-1 line-clamp-2 text-[11px] text-[var(--color-text-3)]">{entryExcerpt(entry, 90)}</p>
      <p className="mt-2 text-[10px] text-[var(--color-text-3)]">
        {entry.authorName?.split(" ")[0] ?? "—"} · {formatBitacoraTime(entry.createdAt)}
      </p>
    </Link>
  );
}

function groupEntriesByDate(entries: BitacoraEntry[]): Array<[string, BitacoraEntry[]]> {
  const map = new Map<string, BitacoraEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.shiftDate) ?? [];
    list.push(entry);
    map.set(entry.shiftDate, list);
  }
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
}

function groupEntriesByShift(entries: BitacoraEntry[]): Array<{ shift: ShiftKey; entries: BitacoraEntry[] }> {
  const map = new Map<ShiftKey, BitacoraEntry[]>();
  for (const shift of SHIFT_ORDER) map.set(shift, []);
  for (const entry of entries) {
    map.get(entry.shift)?.push(entry);
  }
  return SHIFT_ORDER.map((shift) => ({ shift, entries: map.get(shift) ?? [] })).filter(
    (group) => group.entries.length > 0,
  );
}

function FeedExcerpt({ entry, max = 140 }: { entry: BitacoraEntry; max?: number }) {
  const plain = entryExcerpt(entry, max);
  if (plain === "Sin contenido") {
    return <span className="b-log-feed__excerpt">Sin contenido</span>;
  }

  const parts = truncateInlineParts(tipTapInlineParts(entry.contentJson), max);
  if (!parts.length) {
    return <span className="b-log-feed__excerpt">{plain}</span>;
  }

  return (
    <p className="b-log-feed__excerpt">
      {parts.map((part, i) => (
        <ExcerptPart key={i} part={part} />
      ))}
    </p>
  );
}

function ExcerptPart({ part }: { part: TipTapInlinePart }) {
  if (part.kind === "mention") {
    return <span className="b-log-feed__mention">@{part.label}</span>;
  }
  if (part.kind === "entity") {
    return (
      <span className={cn("b-log-feed__entity", `b-log-feed__entity--${part.entityKind}`)}>
        {part.label}
      </span>
    );
  }
  return <span>{part.value}</span>;
}

function FeedRow({
  entry,
  pinned = false,
  showDate = false,
}: {
  entry: BitacoraEntry;
  pinned?: boolean;
  showDate?: boolean;
}) {
  const meta = KIND_META[entry.kind];
  const KindIcon = meta.icon;
  const title = entryDisplayTitle(entry);
  const href = `/bitacora/${entry.id}`;
  const linkedEntities = extractLinkedEntities(entry);

  return (
    <Link href={href} className={cn("b-log-feed__row group", entry.kind, pinned && "is-pinned")}>
      <span className={cn("b-log-feed__accent", entry.kind)} aria-hidden />
      <div className="b-log-feed__main">
        <div className="b-log-feed__row-top">
          <span className={cn("b-log-feed__kind", entry.kind)}>
            <KindIcon size={11} strokeWidth={2.25} aria-hidden />
            {meta.label}
          </span>
          <span className="b-log-feed__shift" title={shiftBadgeLabel(entry.shift)}>
            {SHIFT_LABEL[entry.shift]}
          </span>
          {showDate ? (
            <span className="b-log-feed__date text-[10px] font-medium text-[var(--color-text-3)]">
              {formatShiftDateHuman(entry.shiftDate)}
            </span>
          ) : null}
          {pinned ? (
            <span className="b-log-feed__pin">
              <Pin size={10} aria-hidden />
            </span>
          ) : null}
        </div>
        <h3 className="b-log-feed__title">{title}</h3>
        <FeedExcerpt entry={entry} />
        {linkedEntities.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {linkedEntities.map((entity) => (
              <span
                key={`${entity.entityKind}-${entity.label}`}
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  entity.entityKind === "bus"
                    ? "border-sky-300/40 bg-sky-500/10 text-sky-100"
                    : entity.entityKind === "ticket"
                      ? "border-fuchsia-300/40 bg-fuchsia-500/10 text-fuchsia-100"
                      : entity.entityKind === "line"
                        ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-100"
                        : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]",
                )}
              >
                {entity.label}
              </span>
            ))}
          </div>
        ) : null}
        <div className="b-log-feed__meta-row">
          <span>{entry.authorName?.split(" ")[0] ?? "—"}</span>
          <span aria-hidden>·</span>
          <span>{formatBitacoraTime(entry.createdAt)}</span>
          <span aria-hidden>·</span>
          <span>{formatRelativeShort(Date.now() - new Date(entry.createdAt).getTime())}</span>
        </div>
      </div>
      <div className="b-log-feed__aside">
        <span className="b-log-feed__avatar">{initials(entry.authorName)}</span>
        <span className="b-log-feed__meta">
          {entry.authorName?.split(" ")[0] ?? "—"}
          <span aria-hidden> · </span>
          {formatBitacoraTime(entry.createdAt)}
        </span>
        <span className="b-log-feed__rel">
          {formatRelativeShort(Date.now() - new Date(entry.createdAt).getTime())}
        </span>
        <ChevronRight size={16} className="b-log-feed__chevron" aria-hidden />
      </div>
    </Link>
  );
}

function extractLinkedEntities(entry: BitacoraEntry): Array<{ entityKind: string; label: string }> {
  const entities = tipTapInlineParts(entry.contentJson).filter(
    (part): part is Extract<TipTapInlinePart, { kind: "entity" }> => part.kind === "entity",
  );
  const out: Array<{ entityKind: string; label: string }> = [];
  const seen = new Set<string>();
  for (const e of entities) {
    const key = `${e.entityKind}:${e.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ entityKind: e.entityKind, label: e.label });
    if (out.length >= 4) break;
  }
  return out;
}
