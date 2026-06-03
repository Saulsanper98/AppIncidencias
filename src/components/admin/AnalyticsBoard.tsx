"use client";

/**
 * AnalyticsBoard — Cuadro de mando de telemetría UX (/admin/analytics).
 *
 * Hero con métricas grandes inline + grid de tarjetas:
 *   1) Funnels (donut gauges con tasa de completitud).
 *   2) Tiempo por sección (barras horizontales con icono).
 *   3) Tiempo de creación de ticket por usuario (avatar + barra comparativa).
 *   4) Actividad por turno (barras horizontales con contexto).
 *   5) Ranking de productividad (podio top 3 + tabla compacta).
 *   6) Top búsquedas Ctrl+K (ranking + n_results).
 *   7) Errores cliente (badge n + tiempo relativo).
 *
 * Es solo lectura: no hay acciones destructivas.
 */

import { motion } from "framer-motion";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Bus,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  Flame,
  Gauge,
  Hourglass,
  Layers,
  Loader2,
  Minus,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Sunrise,
  Network,
  Route,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type Trend = { value: number; prev: number; delta_pct: number | null };

type Summary = {
  page_visits: { path: string | null; visits: number; total_ms: number; avg_ms: number }[];
  top_searches: { query: string; n: number; avg_results: number }[];
  errors: { message: string; n: number; last_at: string }[];
  funnels: {
    flow: string;
    opens: number;
    completes: number;
    abandons: number;
    avg_complete_ms: number;
  }[];
  ticket_create_by_user: {
    userId: string | null;
    name: string | null;
    completes: number;
    avg_ms: number;
    median_ms: number;
    timed_samples: number;
  }[];
  by_shift: { shift: string; events: number; visits: number; creates: number }[];
  ranking: {
    userId: string;
    name: string;
    role: string | null;
    tickets_created: number;
    tickets_resolved: number;
    page_visits: number;
    active_minutes: number;
  }[];
  active_users: { today: number; week: number };
  totals: { events: number; sessions: number; events_prev?: number; sessions_prev?: number };
  heatmap: number[][];
  timeseries: { date: string; events: number; visits: number; creates: number }[];
  api_errors: { path: string; status: number; n: number; avg_ms: number; last_at: string }[];
  by_role: { role: string; events: number; users: number }[];
  tickets: {
    created: number;
    resolved: number;
    open: number;
    sla_breached: number;
    sla_total: number;
    mttr_minutes: number;
    median_resolution_minutes: number;
    by_priority: { priority: string; n: number; resolved: number }[];
    mttr_by_priority: { priority: string; median_minutes: number; samples: number }[];
    worst_sla_overrun_minutes: number;
    top_buses: { busId: string; n: number }[];
  };
  fleet: {
    by_bus: {
      busId: string;
      operator: string | null;
      municipio: string | null;
      total: number;
      resolved: number;
      open: number;
      sla_breached: number;
    }[];
    by_linea: { linea: string; total: number; resolved: number; open: number; buses: number }[];
    by_operator: {
      operator: string;
      total: number;
      resolved: number;
      open: number;
      buses: number;
    }[];
  };
  state_durations: {
    state: string;
    avg_minutes: number;
    median_minutes: number;
    samples: number;
  }[];
  response_time: {
    avg_minutes: number;
    median_minutes: number;
    samples: number;
    by_user: {
      userId: string;
      name: string | null;
      avg_minutes: number;
      median_minutes: number;
      samples: number;
    }[];
  };
  trends: {
    events: Trend;
    sessions: Trend;
    tickets_resolved: Trend;
    tickets_created: Trend;
  };
};

type Range = 1 | 7 | 30 | 90;

const RANGE_OPTIONS: { v: Range; label: string }[] = [
  { v: 1, label: "Hoy" },
  { v: 7, label: "7 días" },
  { v: 30, label: "30 días" },
  { v: 90, label: "90 días" },
];

const SHIFT_META: Record<
  string,
  { label: string; short: string; Icon: typeof Sun; bg: string; ring: string; text: string }
> = {
  M: {
    label: "Mañana",
    short: "06–14",
    Icon: Sunrise,
    bg: "from-amber-500/20 via-amber-500/5 to-transparent",
    ring: "ring-amber-500/30",
    text: "text-amber-300",
  },
  T: {
    label: "Tarde",
    short: "14–22",
    Icon: Sun,
    bg: "from-orange-500/20 via-orange-500/5 to-transparent",
    ring: "ring-orange-500/30",
    text: "text-orange-300",
  },
  N: {
    label: "Noche",
    short: "22–06",
    Icon: Moon,
    bg: "from-indigo-500/20 via-indigo-500/5 to-transparent",
    ring: "ring-indigo-500/30",
    text: "text-indigo-300",
  },
  "?": {
    label: "Sin turno",
    short: "—",
    Icon: Clock,
    bg: "from-slate-500/20 via-slate-500/5 to-transparent",
    ring: "ring-slate-500/30",
    text: "text-slate-300",
  },
};

const SECTION_META: Record<string, { Icon: typeof Sun; tone: string }> = {
  "/tickets": { Icon: Layers, tone: "text-sky-300" },
  "/dashboard": { Icon: BarChart3, tone: "text-violet-300" },
  "/admin": { Icon: Users, tone: "text-amber-300" },
  "/feedback": { Icon: Sparkles, tone: "text-emerald-300" },
  "/preventivo": { Icon: Zap, tone: "text-orange-300" },
  "/pase-turno": { Icon: Hourglass, tone: "text-cyan-300" },
  "/lectura": { Icon: Eye, tone: "text-pink-300" },
  "/kb": { Icon: Search, tone: "text-blue-300" },
};

export function AnalyticsBoard() {
  const [range, setRange] = useState<Range>(7);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  /** Filtro por rol para la sección de ranking. */
  const [roleFilter, setRoleFilter] = useState<"all" | string>("all");
  /** Tab activo en la card "Incidencias por flota". */
  const [fleetTab, setFleetTab] = useState<"bus" | "linea" | "operator">("bus");
  /** Cuántas filas mostrar en la tabla de flota (paginación simple). */
  const [fleetLimit, setFleetLimit] = useState(15);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics/summary?days=${range}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { summary: Summary };
      setData(json.summary);
      setLastFetch(new Date());
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh cada 60s en silencio. Útil para wallboard.
  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  // Etiqueta dinámica del periodo de comparación.
  const compareLabel =
    range === 1 ? "vs ayer" : range === 7 ? "vs 7 días previos" : `vs ${range} días previos`;

  const filteredRanking = useMemo(() => {
    if (!data) return [];
    if (roleFilter === "all") return data.ranking;
    return data.ranking.filter((r) => r.role === roleFilter);
  }, [data, roleFilter]);

  return (
    <div className="space-y-6">
      {/* ───── HERO ───── */}
      <header
        className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] px-6 py-6 sm:px-8 sm:py-7"
        style={{
          background:
            "radial-gradient(ellipse at 15% 0%, rgba(37,99,235,0.22) 0%, transparent 55%), radial-gradient(ellipse at 95% 100%, rgba(168,85,247,0.18) 0%, transparent 55%), linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%)",
        }}
      >
        {/* Patrón de puntos sutil */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative flex flex-col gap-5">
          {/* Fila título + acciones */}
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-violet-600 shadow-lg shadow-[var(--color-accent)]/20">
                <BarChart3 size={26} className="text-white" strokeWidth={2.4} />
                <span className="absolute -right-1 -top-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-1)] sm:text-3xl">
                    Analítica de uso
                  </h1>
                  <span className="hidden rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300 ring-1 ring-inset ring-emerald-500/30 sm:inline-flex">
                    en vivo
                  </span>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-2)]">
                  Comportamiento real de tus usuarios: tiempos, secciones, productividad por turno y errores del cliente.
                </p>
              </div>
            </div>

            {/* Controles */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-1 shadow-sm backdrop-blur">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setRange(opt.v)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all",
                      range === opt.v
                        ? "bg-gradient-to-br from-[var(--color-accent)] to-violet-600 text-white shadow"
                        : "text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                title="Refrescar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 text-[var(--color-text-2)] backdrop-blur hover:text-[var(--color-text-1)] disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={13} />}
              </button>
            </div>
          </div>

          {/* Fila de KPIs grandes inline (con tendencia vs periodo anterior) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat
              label="Eventos capturados"
              value={data?.totals.events ?? 0}
              trend={data?.trends.events ?? null}
              compareLabel={compareLabel}
              Icon={Activity}
              tone="sky"
              loading={loading && !data}
            />
            <HeroStat
              label="Sesiones únicas"
              value={data?.totals.sessions ?? 0}
              trend={data?.trends.sessions ?? null}
              compareLabel={compareLabel}
              Icon={Sparkles}
              tone="violet"
              loading={loading && !data}
            />
            <HeroStat
              label="Tickets resueltos"
              value={data?.trends.tickets_resolved.value ?? 0}
              trend={data?.trends.tickets_resolved ?? null}
              compareLabel={compareLabel}
              Icon={CheckCircle2}
              tone="emerald"
              loading={loading && !data}
            />
            <HeroStat
              label="Tickets creados"
              value={data?.trends.tickets_created.value ?? 0}
              trend={data?.trends.tickets_created ?? null}
              compareLabel={compareLabel}
              Icon={Flame}
              tone="amber"
              loading={loading && !data}
            />
          </div>

          {/* Mini sparkline de actividad diaria */}
          {data?.timeseries?.length ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-3 backdrop-blur">
              <div className="mb-2 flex items-center justify-between text-[11px]">
                <span className="font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
                  Actividad diaria · {range} día{range === 1 ? "" : "s"}
                </span>
                <span className="font-mono text-[var(--color-text-2)]">
                  Pico: {Math.max(...data.timeseries.map((d) => d.events))} ev/día
                </span>
              </div>
              <SparkLine data={data.timeseries.map((d) => d.events)} />
            </div>
          ) : null}

          {lastFetch ? (
            <div className="flex items-center gap-2 text-[10.5px] text-[var(--color-text-3)]">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Actualizado {timeAgo(lastFetch)} · auto-refresco cada 60s · ventana de {range} día{range === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-[var(--color-error)]/40 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      {/* ───── FUNNELS + TIEMPO CREACIÓN ───── */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Card
          title="Embudos de flujos clave"
          Icon={Filter}
          subtitle="Tasa de completitud y duración media"
          className="lg:col-span-2"
        >
          {!data || data.funnels.length === 0 ? (
            <EmptyHint text="Sin actividad registrada en este rango." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.funnels.map((f) => {
                const pct = f.opens > 0 ? Math.round((f.completes / f.opens) * 100) : 0;
                return <FunnelDonut key={f.flow} flow={f.flow} pct={pct} funnel={f} />;
              })}
            </div>
          )}
        </Card>

        <Card
          title="Tickets creados por usuario"
          Icon={Hourglass}
          subtitle="Todos los creadores · mediana de tiempo en formulario cuando hay telemetría"
        >
          {!data || data.ticket_create_by_user.length === 0 ? (
            <EmptyHint text="Aún no hay creaciones en este rango." />
          ) : (
            (() => {
              const maxByCount = Math.max(
                ...data.ticket_create_by_user.map((u) => u.completes),
                1,
              );
              return (
                <ul
                  className={cn(
                    "space-y-2",
                    data.ticket_create_by_user.length > 8
                      ? "max-h-[480px] overflow-y-auto pr-1"
                      : "",
                  )}
                >
                  {data.ticket_create_by_user.map((u) => {
                    const pct = Math.round((u.completes / maxByCount) * 100);
                    const hasTime = u.timed_samples > 0 && u.median_ms > 0;
                    return (
                      <li
                        key={u.userId ?? u.name ?? "anon"}
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Avatar name={u.name} />
                            <div className="min-w-0">
                              <p className="truncate text-[12.5px] font-semibold text-[var(--color-text-1)]">
                                {u.name ?? "Sin sesión"}
                              </p>
                              <p className="text-[10.5px] text-[var(--color-text-3)]">
                                {u.completes} ticket{u.completes === 1 ? "" : "s"}
                                {hasTime ? ` · ${u.timed_samples} con tiempo medido` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            {hasTime ? (
                              <>
                                <p className="font-mono text-[13.5px] font-bold tabular-nums text-[var(--color-text-1)]">
                                  {formatDuration(u.median_ms)}
                                </p>
                                <p className="text-[10px] text-[var(--color-text-3)]">
                                  media {formatDuration(u.avg_ms)}
                                </p>
                              </>
                            ) : (
                              <p className="text-[10.5px] italic text-[var(--color-text-3)]">
                                sin tiempo medido
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
            })()
          )}
        </Card>
      </div>

      {/* ───── TIEMPO POR SECCIÓN + POR TURNO ───── */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Card
          title="Tiempo de uso por sección"
          Icon={Layers}
          subtitle="Top 10 paths por tiempo total acumulado"
          className="lg:col-span-2"
        >
          {!data || data.page_visits.length === 0 ? (
            <EmptyHint text="Sin visitas en este rango." />
          ) : (
            <div className="space-y-1">
              {data.page_visits.slice(0, 10).map((p, idx) => {
                const max = data.page_visits[0]?.total_ms ?? 1;
                const pct = Math.round((p.total_ms / max) * 100);
                const meta = SECTION_META[p.path ?? ""] ?? {
                  Icon: Layers,
                  tone: "text-[var(--color-text-3)]",
                };
                return (
                  <div
                    key={(p.path ?? "?") + idx}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--color-surface-2)]/40"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-2)]",
                        meta.tone,
                      )}
                    >
                      <meta.Icon size={14} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-mono text-[12.5px] font-semibold text-[var(--color-text-1)]">
                          {p.path || "/"}
                        </p>
                        <p className="shrink-0 text-[10.5px] text-[var(--color-text-3)]">
                          {p.visits} visita{p.visits === 1 ? "" : "s"} · ~{formatDuration(p.avg_ms)} media
                        </p>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] via-indigo-500 to-violet-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <p className="font-mono text-[12px] font-bold tabular-nums text-[var(--color-text-1)]">
                      {formatDuration(p.total_ms)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Actividad por turno" Icon={Clock} subtitle="Cuándo se trabaja más">
          {!data || data.by_shift.length === 0 ? (
            <EmptyHint text="Sin datos." />
          ) : (
            (() => {
              const totalEvents = data.by_shift.reduce((a, b) => a + b.events, 0) || 1;
              const max = Math.max(...data.by_shift.map((x) => x.events)) || 1;
              return (
                <div className="space-y-2">
                  {data.by_shift.map((s) => {
                    const meta = SHIFT_META[s.shift] ?? SHIFT_META["?"];
                    const pct = Math.round((s.events / max) * 100);
                    const pctTotal = Math.round((s.events / totalEvents) * 100);
                    return (
                      <div
                        key={s.shift}
                        className={cn(
                          "relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-gradient-to-br p-3 ring-1 ring-inset",
                          meta.bg,
                          meta.ring,
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className={cn("inline-flex items-center gap-2", meta.text)}>
                            <meta.Icon size={15} />
                            <span className="text-[11px] font-bold uppercase tracking-widest">
                              {meta.label}
                            </span>
                            <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9.5px] font-semibold">
                              {meta.short}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-[18px] font-bold leading-none tabular-nums text-[var(--color-text-1)]">
                              {s.events.toLocaleString("es-ES")}
                            </p>
                            <p className="text-[9.5px] font-semibold opacity-80">
                              {pctTotal}% del total
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[10.5px] opacity-80">
                          <span className="inline-flex items-center gap-1">
                            <Eye size={10} /> {s.visits} visitas
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Layers size={10} /> {s.creates} ticket{s.creates === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/25">
                          <div
                            className="h-full rounded-full bg-current"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </Card>
      </div>

      {/* ───── RANKING ───── */}
      <Card
        title="Ranking de productividad"
        Icon={Trophy}
        subtitle="Score = (creados × 0.5) + resueltos · ordenado de mayor a menor"
      >
        {!data || data.ranking.length === 0 ? (
          <EmptyHint text="Sin actividad de usuarios en este rango." />
        ) : (
          <div className="space-y-4">
            {/* Filtro por rol */}
            <div className="-mx-1 flex flex-wrap items-center gap-1 overflow-x-auto px-1 pb-1">
              <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                Filtrar:
              </span>
              {(() => {
                const roles = Array.from(
                  new Set(data.ranking.map((r) => r.role).filter(Boolean)),
                ) as string[];
                const opts: { v: "all" | string; label: string }[] = [
                  { v: "all", label: `Todos · ${data.ranking.length}` },
                  ...roles.map((rl) => ({
                    v: rl,
                    label: `${formatRole(rl)} · ${data.ranking.filter((r) => r.role === rl).length}`,
                  })),
                ];
                return opts.map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setRoleFilter(opt.v)}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all",
                      roleFilter === opt.v
                        ? "bg-gradient-to-br from-[var(--color-accent)] to-violet-600 text-white shadow-sm"
                        : "border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
                    )}
                  >
                    {opt.label}
                  </button>
                ));
              })()}
            </div>

            {/* Podio Top 3 (del filtrado) */}
            {filteredRanking.length >= 1 ? <Podium top={filteredRanking.slice(0, 3)} /> : (
              <EmptyHint text="No hay usuarios con este rol en el rango." />
            )}

            {/* Resto */}
            {filteredRanking.length > 3 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[12.5px]">
                  <thead className="text-left text-[10.5px] uppercase tracking-widest text-[var(--color-text-3)]">
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Usuario</th>
                      <th className="px-3 py-2 text-right">Creados</th>
                      <th className="px-3 py-2 text-right">Resueltos</th>
                      <th className="px-3 py-2 text-right">Visitas</th>
                      <th className="px-3 py-2 text-right">Tiempo activo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRanking.slice(3).map((r, i) => (
                      <tr
                        key={r.userId}
                        className="border-b border-[var(--color-border)]/60 transition-colors hover:bg-[var(--color-surface-2)]/40"
                      >
                        <td className="px-3 py-2 font-mono text-[var(--color-text-3)]">{i + 4}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar name={r.name} small />
                            <div className="flex flex-col">
                              <span className="font-medium text-[var(--color-text-1)]">{r.name}</span>
                              {r.role ? (
                                <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-3)]">
                                  {formatRole(r.role)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {r.tickets_created}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[11.5px] font-bold tabular-nums text-emerald-300">
                            {r.tickets_resolved}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-text-2)]">
                          {r.page_visits}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--color-text-2)]">
                          {r.active_minutes} min
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {/* ───── BÚSQUEDAS + ERRORES ───── */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card
          title="Top búsquedas (Ctrl+K)"
          Icon={Search}
          subtitle="Qué buscan los usuarios en el buscador global"
        >
          {!data || data.top_searches.length === 0 ? (
            <EmptyHint text="Aún no hay búsquedas registradas." />
          ) : (
            <ol className="space-y-1">
              {data.top_searches.map((s, idx) => (
                <li
                  key={s.query + idx}
                  className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-[var(--color-surface-2)]/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-2)] font-mono text-[10.5px] font-bold text-[var(--color-text-3)]">
                      {idx + 1}
                    </span>
                    <span className="truncate font-mono text-[12.5px] text-[var(--color-text-1)]">
                      {s.query || "(vacío)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 font-bold tabular-nums text-[var(--color-accent)]">
                      {s.n}×
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-mono tabular-nums",
                        s.avg_results > 0
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-[var(--color-error)]/10 text-[var(--color-error)]",
                      )}
                    >
                      {s.avg_results > 0 ? `~${s.avg_results} res.` : "0 res."}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card
          title="Errores cliente"
          Icon={AlertOctagon}
          subtitle="Agrupados por mensaje, recientes arriba"
          tone="error"
        >
          {!data || data.errors.length === 0 ? (
            <EmptyHint text="Sin errores cliente. Bien hecho." accent="emerald" />
          ) : (
            <ul className="space-y-1.5">
              {data.errors.map((e, idx) => (
                <li
                  key={idx}
                  className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/[0.05] px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-[12px] font-medium text-[var(--color-text-1)]">
                      {e.message}
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--color-error)]/25 px-2 py-0.5 font-mono text-[10.5px] font-bold tabular-nums text-[var(--color-error)]">
                      {e.n}×
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--color-text-3)]">
                    <Clock size={9} className="-mt-0.5 mr-1 inline" />
                    último: {timeAgo(new Date(e.last_at))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ───── BLOQUE NUEVO: SLA / MTTR ───── */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Card
          title="Cumplimiento de SLA"
          Icon={ShieldCheck}
          subtitle="Tickets resueltos a tiempo en el rango"
        >
          {data ? (
            <SlaPanel tickets={data.tickets} />
          ) : (
            <EmptyHint text="Cargando…" />
          )}
        </Card>

        <Card
          title="Tiempo de resolución (MTTR)"
          Icon={Timer}
          subtitle="Datos reales de tickets, no telemetría"
        >
          {data ? (
            <MttrPanel tickets={data.tickets} />
          ) : (
            <EmptyHint text="Cargando…" />
          )}
        </Card>

        <Card
          title="Incidencias por flota"
          Icon={Bus}
          subtitle="Drill-down completo: bus, línea u operador"
        >
          {data ? (
            <FleetDrilldown
              fleet={data.fleet}
              activeTab={fleetTab}
              onTabChange={(t) => {
                setFleetTab(t);
                setFleetLimit(15);
              }}
              limit={fleetLimit}
              onShowMore={() => setFleetLimit((n) => n + 25)}
            />
          ) : (
            <EmptyHint text="Cargando…" />
          )}
        </Card>
      </div>

      {/* ───── BLOQUE NUEVO: TIEMPO POR ESTADO + RESPONSIVIDAD ───── */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card
          title="Tiempo medio en cada estado"
          Icon={Hourglass}
          subtitle="Dónde se atascan los tickets antes de pasar al siguiente estado"
        >
          {data ? (
            <StateDurationsPanel rows={data.state_durations} />
          ) : (
            <EmptyHint text="Cargando…" />
          )}
        </Card>

        <Card
          title="Responsividad del equipo"
          Icon={Zap}
          subtitle="Tiempo desde que se asigna hasta el primer cambio de estado"
        >
          {data ? (
            <ResponseTimePanel rt={data.response_time} />
          ) : (
            <EmptyHint text="Cargando…" />
          )}
        </Card>
      </div>

      {/* ───── BLOQUE NUEVO: HEATMAP DÍA × HORA ───── */}
      <Card
        title="Actividad por día y hora"
        Icon={CalendarDays}
        subtitle="Cuándo se usa la app — útil para detectar horas pico"
      >
        {data && data.heatmap.length === 7 ? (
          <HeatmapDayHour matrix={data.heatmap} />
        ) : (
          <EmptyHint text="Sin datos suficientes." />
        )}
      </Card>

      {/* ───── BLOQUE NUEVO: PRIORIDAD + API ERRORS + ROLES ───── */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Card
          title="Tickets por prioridad"
          Icon={Gauge}
          subtitle="Creados vs resueltos en el rango"
        >
          {!data || data.tickets.by_priority.length === 0 ? (
            <EmptyHint text="Sin tickets en este rango." />
          ) : (
            <ul className="space-y-2">
              {data.tickets.by_priority.map((p) => {
                const pct = p.n > 0 ? Math.round((p.resolved / p.n) * 100) : 0;
                const priorityColor = getPriorityColor(p.priority);
                return (
                  <li
                    key={p.priority}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2"
                  >
                    <div className="flex items-center justify-between text-[12.5px]">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn("h-2.5 w-2.5 rounded-full", priorityColor.dot)}
                        />
                        <span className={cn("font-bold uppercase tracking-wider", priorityColor.text)}>
                          {p.priority}
                        </span>
                      </div>
                      <span className="font-mono text-[var(--color-text-2)]">
                        {p.resolved} / {p.n} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                      <div
                        className={cn("h-full rounded-full", priorityColor.bar)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Errores de API"
          Icon={AlertTriangle}
          subtitle="Endpoints con más fallos · capturados en cliente"
          tone="error"
        >
          {!data || data.api_errors.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center text-[12px] text-emerald-300">
              <CheckCircle2 size={28} />
              <span>Sin errores en este rango.</span>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {data.api_errors.slice(0, 10).map((e, i) => (
                <li
                  key={`${e.path}-${e.status}-${i}`}
                  className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/15 bg-[var(--color-error)]/5 px-2.5 py-1.5"
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold",
                      e.status >= 500
                        ? "bg-[var(--color-error)]/25 text-[var(--color-error)]"
                        : "bg-amber-500/20 text-amber-300",
                    )}
                  >
                    {e.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11.5px] text-[var(--color-text-1)]">
                      {e.path}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-3)]">
                      {e.n}× · ~{e.avg_ms} ms · {timeAgo(new Date(e.last_at))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Eventos por rol"
          Icon={Users}
          subtitle="Quién usa más la app"
        >
          {!data || data.by_role.length === 0 ? (
            <EmptyHint text="Sin datos." />
          ) : (
            <ul className="space-y-2">
              {data.by_role.map((r) => {
                const max = Math.max(...data.by_role.map((x) => x.events), 1);
                const pct = Math.round((r.events / max) * 100);
                return (
                  <li key={r.role} className="space-y-1">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-semibold capitalize text-[var(--color-text-1)]">
                        {formatRole(r.role)}
                      </span>
                      <span className="font-mono text-[var(--color-text-3)]">
                        {r.events.toLocaleString("es-ES")} · {r.users} u.
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-componentes ampliados ───────────────────────────────────────────────

function SlaPanel({ tickets }: { tickets: Summary["tickets"] }) {
  const total = tickets.sla_total;
  const met = total - tickets.sla_breached;
  const pct = total > 0 ? Math.round((met / total) * 100) : 0;
  const tone =
    pct >= 90
      ? {
          ring: "ring-emerald-500/40",
          text: "text-emerald-300",
          bg: "bg-emerald-500/15",
          stroke: "stroke-emerald-400",
          glow: "shadow-[0_0_24px_rgba(16,185,129,0.25)]",
        }
      : pct >= 70
        ? {
            ring: "ring-amber-500/40",
            text: "text-amber-300",
            bg: "bg-amber-500/15",
            stroke: "stroke-amber-400",
            glow: "shadow-[0_0_24px_rgba(245,158,11,0.25)]",
          }
        : {
            ring: "ring-[var(--color-error)]/40",
            text: "text-[var(--color-error)]",
            bg: "bg-[var(--color-error)]/10",
            stroke: "stroke-rose-400",
            glow: "shadow-[0_0_24px_rgba(244,63,94,0.25)]",
          };
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  // Barra apilada: proporción visual cumplidos vs vencidos.
  const metPct = total > 0 ? (met / total) * 100 : 0;
  const breachedPct = 100 - metPct;
  const fmtMin = (m: number) => {
    if (m < 1) return "<1 min";
    if (m < 60) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60);
    const mm = Math.round(m % 60);
    if (h < 24) return `${h}h ${mm}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  };
  return (
    <div className="flex flex-col gap-4">
      {/* Donut + número grande */}
      <div className="flex items-center gap-4">
        <div className={cn("relative shrink-0 rounded-full", tone.glow)}>
          <svg width="108" height="108" viewBox="0 0 108 108">
            <circle cx="54" cy="54" r={r} className="fill-none stroke-[var(--color-surface-3)]" strokeWidth="10" />
            <circle
              cx="54"
              cy="54"
              r={r}
              className={cn("fill-none", tone.stroke)}
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
              transform="rotate(-90 54 54)"
              style={{ transition: "stroke-dashoffset 0.8s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("font-mono text-2xl font-bold leading-none tabular-nums", tone.text)}>
              {pct}%
            </span>
            <span className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
              dentro
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ring-inset", tone.ring, tone.bg, tone.text)}>
            <ShieldCheck size={10} />
            {met} de {total} a tiempo
          </div>
          {tickets.sla_breached > 0 ? (
            <p className="text-[11px] text-[var(--color-text-2)]">
              <AlertOctagon size={10} className="-mt-0.5 mr-1 inline text-[var(--color-error)]" />
              <span className="font-bold text-[var(--color-error)]">{tickets.sla_breached}</span>
              {" "}fuera de plazo
            </p>
          ) : (
            <p className="text-[11px] text-emerald-300">Sin SLA vencidos. ¡Bien!</p>
          )}
          {tickets.worst_sla_overrun_minutes > 0 ? (
            <p className="text-[10.5px] text-[var(--color-text-3)]">
              <Clock size={9} className="-mt-0.5 mr-1 inline" />
              peor retraso: <span className="font-mono font-bold text-[var(--color-text-2)]">
                {fmtMin(tickets.worst_sla_overrun_minutes)}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {/* Barra apilada cumplidos/vencidos */}
      {total > 0 ? (
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              A tiempo
            </span>
            <span className="flex items-center gap-1">
              Vencidos
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            </span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
              style={{ width: `${metPct}%`, transition: "width 0.8s ease" }}
            />
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-rose-400"
              style={{ width: `${breachedPct}%`, transition: "width 0.8s ease" }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-[10px] tabular-nums text-[var(--color-text-2)]">
            <span>{met}</span>
            <span>{tickets.sla_breached}</span>
          </div>
        </div>
      ) : null}

      {/* Footer con tickets abiertos pendientes de cierre — pueden romper SLA */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-[var(--color-text-3)]">Pendientes (aún abiertos)</span>
          <span className="font-mono font-bold tabular-nums text-amber-300">
            {tickets.open}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-[var(--color-text-3)]">
          No cuentan en el % aún, pero pueden vencer si no se cierran a tiempo.
        </p>
      </div>
    </div>
  );
}

function MttrPanel({ tickets }: { tickets: Summary["tickets"] }) {
  const fmt = (mins: number) => {
    if (mins < 1) return "<1 min";
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h < 24) return `${h}h ${m}m`;
    const d = Math.floor(h / 24);
    const hr = h % 24;
    return `${d}d ${hr}h`;
  };
  const maxByPrio = Math.max(
    ...tickets.mttr_by_priority.map((p) => p.median_minutes),
    1,
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-[var(--color-border)] bg-emerald-500/10 p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-200/80">
            Mediana
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-300">
            {tickets.median_resolution_minutes > 0 ? fmt(tickets.median_resolution_minutes) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-sky-500/10 p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-200/80">
            Media
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-sky-300">
            {tickets.mttr_minutes > 0 ? fmt(tickets.mttr_minutes) : "—"}
          </p>
        </div>
      </div>

      {/* MTTR por prioridad — útil para detectar si los críticos no se priorizan */}
      {tickets.mttr_by_priority.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            Mediana por prioridad
          </p>
          <ul className="space-y-1">
            {tickets.mttr_by_priority.map((p) => {
              const meta = getPriorityColor(p.priority);
              const pct = Math.round((p.median_minutes / maxByPrio) * 100);
              return (
                <li key={p.priority} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                      <span className={cn("font-bold uppercase tracking-wider", meta.text)}>
                        {p.priority}
                      </span>
                      <span className="font-mono text-[9.5px] text-[var(--color-text-3)]">
                        ({p.samples})
                      </span>
                    </span>
                    <span className="font-mono font-bold tabular-nums text-[var(--color-text-1)]">
                      {fmt(p.median_minutes)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                    <div
                      className={cn("h-full rounded-full", meta.bar)}
                      style={{ width: `${pct}%`, transition: "width 0.8s ease" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg bg-emerald-500/10 px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-emerald-200/80">Resueltos</p>
          <p className="font-mono text-sm font-bold text-emerald-300">{tickets.resolved}</p>
        </div>
        <div className="rounded-lg bg-amber-500/10 px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-amber-200/80">Creados</p>
          <p className="font-mono text-sm font-bold text-amber-300">{tickets.created}</p>
        </div>
        <div className="rounded-lg bg-rose-500/10 px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-rose-200/80">Abiertos</p>
          <p className="font-mono text-sm font-bold text-rose-300">{tickets.open}</p>
        </div>
      </div>
    </div>
  );
}

function FleetDrilldown({
  fleet,
  activeTab,
  onTabChange,
  limit,
  onShowMore,
}: {
  fleet: Summary["fleet"];
  activeTab: "bus" | "linea" | "operator";
  onTabChange: (t: "bus" | "linea" | "operator") => void;
  limit: number;
  onShowMore: () => void;
}) {
  const tabs: { id: typeof activeTab; label: string; Icon: typeof Bus; count: number }[] = [
    { id: "bus", label: "Buses", Icon: Bus, count: fleet.by_bus.length },
    { id: "linea", label: "Líneas", Icon: Route, count: fleet.by_linea.length },
    { id: "operator", label: "Operadores", Icon: Network, count: fleet.by_operator.length },
  ];
  const rows: { key: string; primary: string; secondary?: string; total: number; resolved: number; open: number; extra?: string; sla?: number }[] = (() => {
    if (activeTab === "bus") {
      return fleet.by_bus.map((b) => ({
        key: b.busId,
        primary: b.busId,
        secondary: [b.operator, b.municipio].filter(Boolean).join(" · ") || undefined,
        total: b.total,
        resolved: b.resolved,
        open: b.open,
        sla: b.sla_breached,
      }));
    }
    if (activeTab === "linea") {
      return fleet.by_linea.map((l) => ({
        key: l.linea,
        primary: l.linea,
        total: l.total,
        resolved: l.resolved,
        open: l.open,
        extra: `${l.buses} bus${l.buses === 1 ? "" : "es"}`,
      }));
    }
    return fleet.by_operator.map((o) => ({
      key: o.operator,
      primary: o.operator,
      total: o.total,
      resolved: o.resolved,
      open: o.open,
      extra: `${o.buses} bus${o.buses === 1 ? "" : "es"}`,
    }));
  })();
  const max = rows[0]?.total ?? 1;
  const visible = rows.slice(0, limit);

  if (rows.length === 0) {
    return <EmptyHint text="Sin tickets en este rango." />;
  }
  return (
    <div className="space-y-3">
      <div className="inline-flex w-full overflow-x-auto rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-1">
        {tabs.map((t) => {
          const Icon = t.Icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all",
                activeTab === t.id
                  ? "bg-gradient-to-br from-[var(--color-accent)] to-violet-600 text-white shadow"
                  : "text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
              )}
            >
              <Icon size={12} />
              {t.label}
              <span className="rounded-full bg-black/15 px-1.5 text-[10px] font-mono tabular-nums">
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-left text-[10px] uppercase tracking-widest text-[var(--color-text-3)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-2 py-1.5">#</th>
              <th className="px-2 py-1.5">{activeTab === "bus" ? "Bus" : activeTab === "linea" ? "Línea" : "Operador"}</th>
              <th className="px-2 py-1.5 text-right">Total</th>
              <th className="px-2 py-1.5 text-right">Resueltos</th>
              <th className="px-2 py-1.5 text-right">Abiertos</th>
              {activeTab === "bus" ? <th className="px-2 py-1.5 text-right">SLA</th> : <th className="px-2 py-1.5 text-right">Buses</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const pct = Math.round((r.total / max) * 100);
              return (
                <tr
                  key={r.key + i}
                  className="border-b border-[var(--color-border)]/60 transition-colors hover:bg-[var(--color-surface-2)]/40"
                >
                  <td className="px-2 py-1.5 font-mono text-[var(--color-text-3)]">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-2)] text-[var(--color-text-2)]">
                        {activeTab === "bus" ? <Bus size={11} /> : activeTab === "linea" ? <Route size={11} /> : <Network size={11} />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-mono font-semibold text-[var(--color-text-1)]">
                          {r.primary}
                        </p>
                        {r.secondary ? (
                          <p className="truncate text-[10px] text-[var(--color-text-3)]">
                            {r.secondary}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--color-text-1)]">
                    {r.total}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-emerald-300">
                      {r.resolved}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {r.open > 0 ? (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-amber-300">
                        {r.open}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-3)]">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--color-text-3)]">
                    {activeTab === "bus"
                      ? r.sla && r.sla > 0
                        ? <span className="text-[var(--color-error)]">{r.sla}</span>
                        : "—"
                      : r.extra ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length > limit ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onShowMore}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-1 text-[11px] font-semibold text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
          >
            Mostrar más
            <ChevronRight size={11} />
            <span className="font-mono text-[10px] text-[var(--color-text-3)]">
              · {rows.length - limit} restantes
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tiempo medio que un ticket pasa EN cada estado antes de transicionar.
 * Útil para detectar dónde se atasca el flujo (p.ej. mucho tiempo en
 * `esperando_repuesto` indica problemas de stock).
 */
function StateDurationsPanel({ rows }: { rows: Summary["state_durations"] }) {
  if (rows.length === 0) {
    return (
      <EmptyHint text="Sin transiciones registradas en este rango. Necesita al menos un ticket que haya cambiado de estado." />
    );
  }
  const stateMeta: Record<
    string,
    { label: string; dot: string; bar: string; Icon: typeof Bus }
  > = {
    abierto: { label: "Abierto", dot: "bg-rose-500", bar: "from-rose-500 to-rose-400", Icon: AlertOctagon },
    en_proceso: { label: "En proceso", dot: "bg-amber-500", bar: "from-amber-500 to-orange-400", Icon: Activity },
    esperando_repuesto: { label: "Esperando repuesto", dot: "bg-sky-500", bar: "from-sky-500 to-cyan-400", Icon: Clock },
    resuelto: { label: "Resuelto", dot: "bg-emerald-500", bar: "from-emerald-500 to-emerald-400", Icon: CheckCircle2 },
  };
  const fmt = (m: number) => {
    if (m < 1) return "<1 min";
    if (m < 60) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60);
    const mm = Math.round(m % 60);
    if (h < 24) return `${h}h ${mm}m`;
    const d = Math.floor(h / 24);
    const hr = h % 24;
    return `${d}d ${hr}h`;
  };
  const max = Math.max(...rows.map((r) => r.avg_minutes), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const meta = stateMeta[r.state] ?? {
          label: r.state,
          dot: "bg-slate-500",
          bar: "from-slate-500 to-slate-400",
          Icon: Clock,
        };
        const pct = Math.round((r.avg_minutes / max) * 100);
        return (
          <li
            key={r.state}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", meta.dot)} />
                <span className="text-[12.5px] font-semibold text-[var(--color-text-1)]">
                  {meta.label}
                </span>
                <span className="rounded-full bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-3)]">
                  {r.samples} muestras
                </span>
              </div>
              <div className="text-right">
                <p className="font-mono text-[14px] font-bold tabular-nums text-[var(--color-text-1)]">
                  {fmt(r.median_minutes)}
                </p>
                <p className="font-mono text-[10px] text-[var(--color-text-3)]">
                  media {fmt(r.avg_minutes)}
                </p>
              </div>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
              <div
                className={cn("h-full rounded-full bg-gradient-to-r", meta.bar)}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Responsividad del equipo: tiempo desde que se asigna un ticket hasta el
 * primer cambio de estado posterior. Muestra global + ranking por técnico.
 */
function ResponseTimePanel({ rt }: { rt: Summary["response_time"] }) {
  if (rt.samples === 0) {
    return (
      <EmptyHint text="Sin asignaciones seguidas de cambios de estado en este rango." />
    );
  }
  const fmt = (m: number) => {
    if (m < 1) return "<1 min";
    if (m < 60) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60);
    const mm = Math.round(m % 60);
    if (h < 24) return `${h}h ${mm}m`;
    const d = Math.floor(h / 24);
    const hr = h % 24;
    return `${d}d ${hr}h`;
  };
  const fastest = rt.by_user[0];
  const slowest = rt.by_user[rt.by_user.length - 1];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-[var(--color-border)] bg-emerald-500/10 p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-200/80">
            Mediana global
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-300">
            {fmt(rt.median_minutes)}
          </p>
          <p className="mt-0.5 text-[10px] text-emerald-200/60">{rt.samples} respuestas</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-sky-500/10 p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-200/80">
            Media global
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-sky-300">
            {fmt(rt.avg_minutes)}
          </p>
          <p className="mt-0.5 text-[10px] text-sky-200/60">a primer cambio</p>
        </div>
      </div>

      {rt.by_user.length > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            <span>Top por mediana</span>
            <span>menor = más rápido</span>
          </div>
          <ul className="space-y-1">
            {rt.by_user.slice(0, 6).map((u, i) => {
              const max = Math.max(...rt.by_user.map((x) => x.median_minutes), 1);
              const pct = Math.round((u.median_minutes / max) * 100);
              const isFast = i === 0 && rt.by_user.length > 1;
              return (
                <li
                  key={u.userId}
                  className="rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-surface-2)]/30 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <Avatar name={u.name} small />
                    <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-text-1)]">
                      {u.name ?? "Sin sesión"}
                      {isFast ? (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                          <Zap size={8} /> top
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-[var(--color-text-2)]">
                      {fmt(u.median_minutes)}
                    </span>
                    <span className="w-12 shrink-0 text-right font-mono text-[10px] text-[var(--color-text-3)]">
                      {u.samples}×
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        isFast
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                          : "bg-gradient-to-r from-sky-500 to-violet-500",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {rt.by_user.length >= 2 && fastest && slowest && fastest.userId !== slowest.userId ? (
            <p className="text-[10.5px] text-[var(--color-text-3)]">
              <Zap size={10} className="-mt-0.5 mr-1 inline text-emerald-300" />
              {fastest.name} responde {Math.round(slowest.median_minutes / Math.max(fastest.median_minutes, 1))}× más rápido que {slowest.name}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getPriorityColor(p: string) {
  switch (p) {
    case "critica":
      return { dot: "bg-rose-500", text: "text-rose-300", bar: "bg-gradient-to-r from-rose-500 to-rose-400" };
    case "alta":
      return { dot: "bg-orange-500", text: "text-orange-300", bar: "bg-gradient-to-r from-orange-500 to-amber-400" };
    case "media":
      return { dot: "bg-amber-500", text: "text-amber-300", bar: "bg-gradient-to-r from-amber-500 to-yellow-400" };
    case "baja":
      return { dot: "bg-emerald-500", text: "text-emerald-300", bar: "bg-gradient-to-r from-emerald-500 to-emerald-400" };
    default:
      return { dot: "bg-slate-500", text: "text-slate-300", bar: "bg-gradient-to-r from-slate-500 to-slate-400" };
  }
}

function formatRole(role: string): string {
  switch (role) {
    case "responsable_taller":
      return "Resp. taller";
    case "tecnico_campo":
      return "Técnico campo";
    case "responsable_inventario":
      return "Resp. inventario";
    case "gestor_movilidad":
      return "Gestor movilidad";
    case "conductor":
      return "Conductor";
    case "(sin rol)":
      return "Sin rol";
    default:
      return role;
  }
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function Card({
  title,
  subtitle,
  Icon,
  children,
  className,
  tone,
}: {
  title: string;
  subtitle?: string;
  Icon: typeof Clock;
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "error";
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5",
        className,
      )}
    >
      <header className="mb-3 flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset",
            tone === "error"
              ? "bg-[var(--color-error)]/10 text-[var(--color-error)] ring-[var(--color-error)]/30"
              : "bg-[var(--color-accent-light)] text-[var(--color-accent)] ring-[var(--color-accent)]/30",
          )}
        >
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13.5px] font-bold leading-tight text-[var(--color-text-1)]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] text-[var(--color-text-3)]">{subtitle}</p>
          ) : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function HeroStat({
  label,
  value,
  trend,
  compareLabel,
  Icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  trend?: Trend | null;
  compareLabel?: string;
  Icon: typeof Clock;
  tone: "sky" | "violet" | "emerald" | "amber";
  loading?: boolean;
}) {
  const toneCls = {
    sky: "from-sky-500/15 via-sky-500/5 to-transparent ring-sky-500/25 text-sky-300",
    violet: "from-violet-500/15 via-violet-500/5 to-transparent ring-violet-500/25 text-violet-300",
    emerald:
      "from-emerald-500/15 via-emerald-500/5 to-transparent ring-emerald-500/25 text-emerald-300",
    amber: "from-amber-500/15 via-amber-500/5 to-transparent ring-amber-500/25 text-amber-300",
  }[tone];

  const trendDelta = trend?.delta_pct ?? null;
  /** "Bueno" subir o bajar depende del KPI (no implementado: asumimos subir = bueno). */
  const trendDirection =
    trendDelta === null
      ? "neutral"
      : trendDelta > 0
        ? "up"
        : trendDelta < 0
          ? "down"
          : "flat";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br p-3.5 ring-1 ring-inset transition-transform hover:-translate-y-0.5",
        toneCls,
      )}
    >
      {/* Glow decorativo de fondo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-current opacity-[0.07] blur-2xl"
      />
      <div className="flex items-start justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-widest opacity-90">
          <Icon size={12} />
          {label}
        </span>
        {trendDirection !== "neutral" && trendDelta !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              trendDirection === "up"
                ? "bg-emerald-500/20 text-emerald-300"
                : trendDirection === "down"
                  ? "bg-[var(--color-error)]/20 text-[var(--color-error)]"
                  : "bg-[var(--color-surface-2)] text-[var(--color-text-3)]",
            )}
            title={compareLabel}
          >
            {trendDirection === "up" ? (
              <TrendingUp size={10} />
            ) : trendDirection === "down" ? (
              <TrendingDown size={10} />
            ) : (
              <Minus size={10} />
            )}
            {trendDelta > 0 ? "+" : ""}
            {trendDelta}%
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-2 font-mono text-3xl font-bold tabular-nums text-[var(--color-text-1)] transition-opacity sm:text-4xl",
          loading ? "opacity-40" : "opacity-100",
        )}
      >
        {value.toLocaleString("es-ES")}
      </p>
      {trend && trend.prev > 0 ? (
        <p className="mt-0.5 text-[10px] text-[var(--color-text-3)]">
          antes {trend.prev.toLocaleString("es-ES")} · {compareLabel}
        </p>
      ) : trend ? (
        <p className="mt-0.5 text-[10px] text-[var(--color-text-3)]">{compareLabel} · sin datos previos</p>
      ) : null}
    </motion.div>
  );
}

/**
 * Línea sparkline simple en SVG. Sin librerías externas: renderiza un
 * polyline con un área degradada debajo. Pensado para hero compacto.
 */
function SparkLine({ data, height = 56 }: { data: number[]; height?: number }) {
  if (data.length === 0) return null;
  const w = 800;
  const max = Math.max(1, ...data);
  const stepX = data.length > 1 ? w / (data.length - 1) : w;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - 4 - (v / max) * (height - 12);
    return [x, y];
  });
  const path =
    `M ${points[0][0]},${points[0][1]} ` +
    points
      .slice(1)
      .map((p, i) => {
        const prev = points[i];
        const mx = (prev[0] + p[0]) / 2;
        return `Q ${prev[0]},${prev[1]} ${mx},${(prev[1] + p[1]) / 2} T ${p[0]},${p[1]}`;
      })
      .join(" ");
  const area = `${path} L ${w},${height} L 0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-14 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={path} stroke="var(--color-accent)" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={i === points.length - 1 ? 4 : 0}
          fill="var(--color-accent)"
        />
      ))}
    </svg>
  );
}

/**
 * Heatmap día×hora. Cada celda es una intensidad de actividad.
 * Útil para detectar horas pico y "valles" donde nadie usa la app.
 */
function HeatmapDayHour({ matrix }: { matrix: number[][] }) {
  const flat = matrix.flat();
  const max = Math.max(1, ...flat);
  const dayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return (
    <div className="overflow-x-auto">
      <div className="inline-grid min-w-full gap-px" style={{ gridTemplateColumns: "auto repeat(24, minmax(14px, 1fr))" }}>
        <div />
        {Array.from({ length: 24 }).map((_, h) => (
          <div
            key={h}
            className="text-center text-[8.5px] font-medium text-[var(--color-text-3)]"
          >
            {h % 3 === 0 ? h.toString().padStart(2, "0") : ""}
          </div>
        ))}
        {matrix.map((row, d) => (
          <FragmentRow key={d} d={d} dayLabels={dayLabels} row={row} max={max} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--color-text-3)]">
        <span>Menos</span>
        {[0.1, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <span
            key={i}
            className="inline-block h-3 w-5 rounded-sm"
            style={{ background: `rgba(99,102,241,${0.1 + v * 0.8})` }}
          />
        ))}
        <span>Más</span>
      </div>
    </div>
  );
}

function FragmentRow({
  d,
  dayLabels,
  row,
  max,
}: {
  d: number;
  dayLabels: string[];
  row: number[];
  max: number;
}) {
  return (
    <>
      <div className="pr-2 text-right text-[10.5px] font-semibold text-[var(--color-text-3)]">
        {dayLabels[d]}
      </div>
      {row.map((v, h) => {
        const intensity = v / max;
        return (
          <div
            key={h}
            className="aspect-square rounded-sm transition-transform hover:scale-110"
            style={{
              background: v === 0
                ? "var(--color-surface-2)"
                : `rgba(99,102,241,${0.08 + intensity * 0.85})`,
            }}
            title={`${dayLabels[d]} ${h.toString().padStart(2, "0")}:00 — ${v} ev`}
          />
        );
      })}
    </>
  );
}

function FunnelDonut({
  flow,
  pct,
  funnel,
}: {
  flow: string;
  pct: number;
  funnel: { opens: number; completes: number; abandons: number; avg_complete_ms: number };
}) {
  const tone =
    pct >= 70
      ? { stroke: "stroke-emerald-500", text: "text-emerald-300", bg: "bg-emerald-500/10" }
      : pct >= 40
        ? { stroke: "stroke-amber-500", text: "text-amber-300", bg: "bg-amber-500/10" }
        : { stroke: "stroke-[var(--color-error)]", text: "text-[var(--color-error)]", bg: "bg-[var(--color-error)]/10" };
  const r = 32;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3 text-center">
      <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-2)]">
        {humanizeFlow(flow)}
      </p>
      <div className="relative h-[88px] w-[88px]">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            strokeWidth="8"
            className="stroke-[var(--color-surface-3)]"
          />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className={cn("transition-all duration-700", tone.stroke)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className={cn("font-mono text-[20px] font-bold tabular-nums", tone.text)}>{pct}%</p>
          <p className="text-[9px] font-semibold uppercase text-[var(--color-text-3)]">comp.</p>
        </div>
      </div>
      <div className="flex w-full items-center justify-around gap-1 text-[10px]">
        <span className="text-[var(--color-text-2)]">
          <strong className="text-[var(--color-text-1)] tabular-nums">{funnel.opens}</strong> abre
        </span>
        <span className="text-emerald-300">
          <strong className="tabular-nums">{funnel.completes}</strong> ok
        </span>
        <span className="text-[var(--color-error)]">
          <strong className="tabular-nums">{funnel.abandons}</strong> abnd
        </span>
      </div>
      {funnel.avg_complete_ms > 0 ? (
        <p className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", tone.bg, tone.text)}>
          <Clock size={9} className="-mt-0.5 mr-1 inline" />
          {formatDuration(funnel.avg_complete_ms)} media
        </p>
      ) : null}
    </div>
  );
}

function Podium({
  top,
}: {
  top: {
    userId: string;
    name: string;
    tickets_created: number;
    tickets_resolved: number;
    page_visits: number;
    active_minutes: number;
  }[];
}) {
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean);
  const heights = ["h-20", "h-28", "h-16"];
  const medals = ["🥈", "🥇", "🥉"];
  const tones = [
    "from-slate-400/30 to-slate-400/0 ring-slate-400/30 text-slate-200",
    "from-amber-400/30 to-amber-400/0 ring-amber-400/40 text-amber-200",
    "from-orange-700/25 to-orange-700/0 ring-orange-700/30 text-orange-200",
  ];

  return (
    <div className="grid grid-cols-3 items-end gap-3">
      {podiumOrder.map((u, i) => (
        <div key={u.userId} className="flex flex-col items-center text-center">
          <div className="mb-2 flex flex-col items-center gap-1">
            <Avatar name={u.name} large />
            <p className="line-clamp-1 text-[12px] font-bold text-[var(--color-text-1)]">
              {u.name}
            </p>
            <p className="text-[10px] text-[var(--color-text-3)]">
              {u.tickets_created} creados · {u.tickets_resolved} resueltos
            </p>
          </div>
          <div
            className={cn(
              "flex w-full items-center justify-center rounded-t-xl bg-gradient-to-t ring-1 ring-inset",
              heights[i],
              tones[i],
            )}
          >
            <span className="text-2xl">{medals[i]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Avatar({
  name,
  small,
  large,
}: {
  name: string | null;
  small?: boolean;
  large?: boolean;
}) {
  const initials = initialsOf(name);
  const hue = hashHue(name ?? "?");
  const size = large ? "h-12 w-12 text-[14px]" : small ? "h-6 w-6 text-[9.5px]" : "h-8 w-8 text-[11px]";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-1 ring-inset ring-white/10",
        size,
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 65% 45%) 0%, hsl(${(hue + 40) % 360} 65% 35%) 100%)`,
      }}
    >
      {initials}
    </span>
  );
}

function EmptyHint({ text, accent }: { text: string; accent?: "emerald" }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] py-8 text-center text-[12px]",
        accent === "emerald" ? "text-emerald-300" : "text-[var(--color-text-3)]",
      )}
    >
      <Sparkles size={18} className="opacity-50" />
      <p className="italic">{text}</p>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    return `${m} min ${s}s`;
  }
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return `${h} h ${m} min`;
}

function humanizeFlow(flow: string): string {
  const map: Record<string, string> = {
    ticket_create: "Crear ticket",
    feedback_submit: "Enviar feedback",
    quickticket: "Quick ticket",
  };
  return map[flow] ?? flow;
}

function initialsOf(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function timeAgo(date: Date): string {
  const sec = Math.round((Date.now() - date.getTime()) / 1000);
  if (sec < 5) return "ahora mismo";
  if (sec < 60) return `hace ${sec}s`;
  if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
