"use client";

import {
  Building2,
  Bus as BusIcon,
  ChevronRight,
  LayoutGrid,
  Search,
  ShieldAlert,
  Table2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BusAvatar } from "@/components/flota/bus-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { KbGridSkeleton } from "@/components/ui/view-skeletons";
import { formatMunicipio, operatorInitials, operatorTone } from "@/lib/flota-ui";
import { cn } from "@/lib/utils";

export type CatalogBus = {
  id: string;
  operator: string;
  municipio: string;
  lineas: string[];
  description: string | null;
  coverPhotoUrl: string | null;
};

type AnomalousBus = {
  busId: string;
  ticketCount: number;
  score: number;
};

type ViewMode = "mosaico" | "tabla" | "operadoras";

const VIEW_STORAGE_KEY = "flota:view";

type Props = {
  canManage: boolean;
};

export function FlotaIndex({ canManage }: Props) {
  const [buses, setBuses] = useState<CatalogBus[]>([]);
  const [anomalousIds, setAnomalousIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [operatorFilter, setOperatorFilter] = useState<string | null>(null);
  const [onlyAnomalous, setOnlyAnomalous] = useState(false);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "tabla";
    const saved = window.sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "mosaico" || saved === "tabla" || saved === "operadoras") return saved;
    return "tabla";
  });

  useEffect(() => {
    if (typeof window !== "undefined") window.sessionStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogRes, anomRes] = await Promise.all([
        fetch("/api/catalog", { cache: "no-store" }),
        fetch("/api/buses/anomalous", { cache: "no-store" }),
      ]);
      if (catalogRes.ok) {
        const data = (await catalogRes.json()) as { buses: CatalogBus[] };
        setBuses(data.buses ?? []);
      }
      if (anomRes.ok) {
        const data = (await anomRes.json()) as { anomalous: AnomalousBus[] };
        setAnomalousIds(new Set((data.anomalous ?? []).map((a) => a.busId)));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const operators = useMemo(
    () => [...new Set(buses.map((b) => b.operator).filter(Boolean))].sort(),
    [buses],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return buses.filter((bus) => {
      if (operatorFilter && bus.operator !== operatorFilter) return false;
      if (onlyAnomalous && !anomalousIds.has(bus.id)) return false;
      if (!q) return true;
      const haystack = [bus.id, bus.operator, bus.municipio, ...bus.lineas, bus.description ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [buses, query, operatorFilter, onlyAnomalous, anomalousIds]);

  const groupedByOperator = useMemo(() => {
    const map = new Map<string, CatalogBus[]>();
    for (const bus of filtered) {
      const key = bus.operator || "Sin operadora";
      const list = map.get(key) ?? [];
      list.push(bus);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [filtered]);

  const viewButtons: { id: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
    { id: "tabla", label: "Tabla", icon: Table2 },
    { id: "mosaico", label: "Mosaico", icon: LayoutGrid },
    { id: "operadoras", label: "Por operadora", icon: Building2 },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[var(--color-text-3)]">
            <BusIcon size={16} aria-hidden />
            <span className="text-[12px] font-medium uppercase tracking-wider">Flota</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-[var(--color-text-1)]">Catálogo de flota</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-3)]">
            {filtered.length} de {buses.length} buses
            {anomalousIds.size > 0 ? ` · ${anomalousIds.size} anómalos` : ""}.
            {canManage ? (
              <>
                {" "}
                Gestión en{" "}
                <Link href="/admin/catalog" className="text-[var(--color-accent)] hover:underline">
                  Administración → Catálogo
                </Link>
                .
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar id, operadora, línea…"
              className="pl-9"
              aria-label="Buscar buses"
            />
          </div>
          <div
            className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
            role="tablist"
            aria-label="Vista de flota"
          >
            {viewButtons.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  view === id
                    ? "bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                    : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
                )}
              >
                <Icon size={13} aria-hidden />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOperatorFilter(null)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
            operatorFilter === null
              ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]",
          )}
        >
          Todas las operadoras
        </button>
        {operators.map((op) => {
          const tone = operatorTone(op);
          return (
            <button
              key={op}
              type="button"
              onClick={() => setOperatorFilter(operatorFilter === op ? null : op)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                operatorFilter === op ? tone.chip : "border-[var(--color-border)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]",
              )}
            >
              {op}
            </button>
          );
        })}
        {anomalousIds.size > 0 ? (
          <button
            type="button"
            onClick={() => setOnlyAnomalous((v) => !v)}
            className={cn(
              "ml-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
              onlyAnomalous
                ? "border-[var(--color-warning)]/50 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                : "border-[var(--color-border)] text-[var(--color-text-3)] hover:text-[var(--color-warning)]",
            )}
          >
            <ShieldAlert size={11} aria-hidden />
            Solo anómalos
          </button>
        ) : null}
      </div>

      {loading ? (
        <KbGridSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BusIcon}
          title="Sin buses"
          hint={query ? `No hay resultados para "${query}".` : "Aún no hay buses en el catálogo."}
        />
      ) : view === "tabla" ? (
        <TableView buses={filtered} anomalousIds={anomalousIds} />
      ) : view === "mosaico" ? (
        <MosaicView buses={filtered} anomalousIds={anomalousIds} />
      ) : (
        <OperatorGroupsView groups={groupedByOperator} anomalousIds={anomalousIds} />
      )}
    </div>
  );
}

function AnomalyBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-[var(--color-warning-light)] font-semibold text-[var(--color-warning)] ring-1 ring-[var(--color-warning)]/30",
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
      )}
    >
      <ShieldAlert size={compact ? 9 : 10} aria-hidden />
      Anómalo
    </span>
  );
}

function SinLineasPill() {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 px-2 py-0.5 text-[10px] text-[var(--color-text-3)]">
      Sin líneas
    </span>
  );
}

function LineaChips({ lineas, max = 4 }: { lineas: string[]; max?: number }) {
  if (lineas.length === 0) return <SinLineasPill />;
  return (
    <div className="flex flex-wrap gap-1">
      {lineas.slice(0, max).map((l) => (
        <span
          key={l}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-2)]"
        >
          {l}
        </span>
      ))}
      {lineas.length > max ? (
        <span className="self-center text-[10px] text-[var(--color-text-3)]">+{lineas.length - max}</span>
      ) : null}
    </div>
  );
}

function OperatorChip({ operator, className }: { operator: string; className?: string }) {
  const tone = operatorTone(operator);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
        tone.chip,
        className,
      )}
    >
      <span className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[7px] font-bold ring-1", tone.avatar)}>
        {operatorInitials(operator)}
      </span>
      <span className="truncate">{operator}</span>
    </span>
  );
}

function MosaicView({
  buses,
  anomalousIds,
}: {
  buses: CatalogBus[];
  anomalousIds: Set<string>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {buses.map((bus) => {
        const isAnomalous = anomalousIds.has(bus.id);
        const tone = operatorTone(bus.operator);
        const municipio = formatMunicipio(bus.municipio);
        return (
          <Link
            key={bus.id}
            href={`/flota/${encodeURIComponent(bus.id)}`}
            className={cn(
              "group relative flex overflow-hidden rounded-xl border bg-[var(--color-surface)] transition-all duration-200",
              "hover:-translate-y-0.5 hover:border-[var(--color-accent)]/45 hover:shadow-lg hover:shadow-black/20",
              tone.header.split(" ").pop(),
            )}
          >
            {/* Franja lateral con avatar */}
            <div
              className={cn(
                "relative flex w-[72px] shrink-0 flex-col items-center justify-center border-r border-[var(--color-border)]/50 bg-gradient-to-b sm:w-[80px]",
                tone.header.split(" ").slice(0, 2).join(" "),
              )}
            >
              {bus.coverPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bus.coverPhotoUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
              ) : null}
              <BusAvatar busId={bus.id} operator={bus.operator} size={56} variant="suffix" />
            </div>

            {/* Contenido */}
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 pr-8">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[15px] font-bold leading-tight text-[var(--color-text-1)] group-hover:text-[var(--color-accent)]">
                    {bus.id}
                  </p>
                  <div className="mt-1.5">
                    <OperatorChip operator={bus.operator || "Sin operadora"} />
                  </div>
                </div>
                {isAnomalous ? <AnomalyBadge compact /> : null}
              </div>
              {municipio ? (
                <p className="text-[11px] text-[var(--color-text-3)]">{municipio}</p>
              ) : null}
              {bus.description?.trim() ? (
                <p className="line-clamp-2 text-[11px] leading-snug text-[var(--color-text-3)] italic">
                  {bus.description.trim()}
                </p>
              ) : null}
              <div className="mt-auto">
                <LineaChips lineas={bus.lineas} max={3} />
              </div>
            </div>
            <ChevronRight
              size={15}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)] opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </Link>
        );
      })}
    </div>
  );
}

function TableView({
  buses,
  anomalousIds,
}: {
  buses: CatalogBus[];
  anomalousIds: Set<string>;
}) {
  const router = useRouter();

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/80 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
              <th className="px-4 py-3 font-medium">Bus</th>
              <th className="px-4 py-3 font-medium">Operadora</th>
              <th className="px-4 py-3 font-medium">Municipio</th>
              <th className="px-4 py-3 font-medium">Líneas</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {buses.map((bus) => {
              const isAnomalous = anomalousIds.has(bus.id);
              const municipio = formatMunicipio(bus.municipio);
              const href = `/flota/${encodeURIComponent(bus.id)}`;
              return (
                <tr
                  key={bus.id}
                  tabIndex={0}
                  role="link"
                  onClick={() => router.push(href)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(href);
                    }
                  }}
                  className="cursor-pointer border-b border-[var(--color-border)]/60 transition-colors last:border-0 hover:bg-[var(--color-accent-light)]/12"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {bus.coverPhotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={bus.coverPhotoUrl}
                          alt=""
                          className="h-9 w-12 rounded-md object-cover ring-1 ring-[var(--color-border)]"
                        />
                      ) : (
                        <BusAvatar busId={bus.id} operator={bus.operator} size={36} variant="suffix" />
                      )}
                      <span className="font-mono text-[13px] font-semibold text-[var(--color-text-1)]">{bus.id}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <OperatorChip operator={bus.operator || "Sin operadora"} />
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-2)]">
                    {municipio ?? <span className="text-[var(--color-text-3)]">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <LineaChips lineas={bus.lineas} max={2} />
                  </td>
                  <td className="px-4 py-2.5">
                    {isAnomalous ? (
                      <AnomalyBadge compact />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300/90">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                        Normal
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OperatorGroupsView({
  groups,
  anomalousIds,
}: {
  groups: [string, CatalogBus[]][];
  anomalousIds: Set<string>;
}) {
  return (
    <div className="space-y-5">
      {groups.map(([operator, list]) => {
        const tone = operatorTone(operator);
        const anomalousCount = list.filter((b) => anomalousIds.has(b.id)).length;
        return (
          <section
            key={operator}
            className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
          >
            <header
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)]/80 px-4 py-3 bg-gradient-to-r",
                tone.header.split(" ").slice(0, 2).join(" "),
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl text-[11px] font-bold ring-1", tone.avatar)}>
                  {operatorInitials(operator)}
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold text-[var(--color-text-1)]">{operator}</h2>
                  <p className="text-[11px] text-[var(--color-text-3)]">
                    {list.length} buses
                    {anomalousCount > 0 ? (
                      <span className="ml-1 text-[var(--color-warning)]">· {anomalousCount} anómalos</span>
                    ) : null}
                  </p>
                </div>
              </div>
            </header>
            <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((bus) => {
                const isAnomalous = anomalousIds.has(bus.id);
                const municipio = formatMunicipio(bus.municipio);
                return (
                  <Link
                    key={bus.id}
                    href={`/flota/${encodeURIComponent(bus.id)}`}
                    className="group flex items-center gap-2.5 rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-surface-2)]/40 px-2.5 py-2 transition-all hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)]/10"
                  >
                    <BusAvatar busId={bus.id} operator={bus.operator} size={40} variant="suffix" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-mono text-[12.5px] font-semibold text-[var(--color-text-1)] group-hover:text-[var(--color-accent)]">
                          {bus.id}
                        </p>
                        {isAnomalous ? <AnomalyBadge compact /> : null}
                      </div>
                      <p className="truncate text-[10.5px] text-[var(--color-text-3)]">
                        {municipio ?? (bus.lineas.length ? bus.lineas.slice(0, 2).join(", ") : "Sin líneas")}
                      </p>
                    </div>
                    <ChevronRight size={13} className="shrink-0 text-[var(--color-text-3)] opacity-60 group-hover:opacity-100" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
