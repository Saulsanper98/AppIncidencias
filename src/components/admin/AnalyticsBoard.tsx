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

import {
  Activity,
  AlertOctagon,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Clock,
  Eye,
  Filter,
  Hourglass,
  Layers,
  Loader2,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Sunrise,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

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
  }[];
  by_shift: { shift: string; events: number; visits: number; creates: number }[];
  ranking: {
    userId: string;
    name: string;
    tickets_created: number;
    tickets_resolved: number;
    page_visits: number;
    active_minutes: number;
  }[];
  active_users: { today: number; week: number };
  totals: { events: number; sessions: number };
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
  const [prevData, setPrevData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics/summary?days=${range}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { summary: Summary };
      setPrevData(data);
      setData(json.summary);
      setLastFetch(new Date());
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
    // Deliberadamente no incluimos `data` en deps: solo se usa para conservar
    // el snapshot previo antes de pisarlo y mostrar deltas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const deltaEvents = useMemo(() => {
    if (!data || !prevData) return null;
    const diff = data.totals.events - prevData.totals.events;
    if (diff === 0) return null;
    return diff;
  }, [data, prevData]);

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

          {/* Fila de KPIs grandes inline */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat
              label="Eventos capturados"
              value={data?.totals.events ?? 0}
              delta={deltaEvents}
              Icon={Activity}
              tone="sky"
              loading={loading && !data}
            />
            <HeroStat
              label="Sesiones"
              value={data?.totals.sessions ?? 0}
              Icon={Sparkles}
              tone="violet"
              loading={loading && !data}
            />
            <HeroStat
              label="Activos hoy"
              value={data?.active_users.today ?? 0}
              Icon={Users}
              tone="emerald"
              loading={loading && !data}
            />
            <HeroStat
              label={`Activos · ${range}d`}
              value={data?.active_users.week ?? 0}
              Icon={Users}
              tone="amber"
              loading={loading && !data}
            />
          </div>

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
      <div className="grid gap-4 lg:grid-cols-3">
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
          title="Tiempo de creación de ticket"
          Icon={Hourglass}
          subtitle="Mediana por usuario · barra comparativa"
        >
          {!data || data.ticket_create_by_user.length === 0 ? (
            <EmptyHint text="Aún no hay creaciones." />
          ) : (
            (() => {
              const max = Math.max(
                ...data.ticket_create_by_user.map((u) => u.median_ms),
                1,
              );
              return (
                <ul className="space-y-2">
                  {data.ticket_create_by_user.slice(0, 8).map((u) => {
                    const pct = Math.round((u.median_ms / max) * 100);
                    const fast = u.median_ms <= max * 0.45;
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
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-[13.5px] font-bold tabular-nums text-[var(--color-text-1)]">
                              {formatDuration(u.median_ms)}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-3)]">
                              media {formatDuration(u.avg_ms)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              fast
                                ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                                : "bg-gradient-to-r from-amber-500 to-orange-400",
                            )}
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
      <div className="grid gap-4 lg:grid-cols-3">
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
            {/* Podio Top 3 */}
            {data.ranking.length >= 1 ? <Podium top={data.ranking.slice(0, 3)} /> : null}

            {/* Resto */}
            {data.ranking.length > 3 ? (
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
                    {data.ranking.slice(3).map((r, i) => (
                      <tr
                        key={r.userId}
                        className="border-b border-[var(--color-border)]/60 transition-colors hover:bg-[var(--color-surface-2)]/40"
                      >
                        <td className="px-3 py-2 font-mono text-[var(--color-text-3)]">{i + 4}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar name={r.name} small />
                            <span className="font-medium text-[var(--color-text-1)]">{r.name}</span>
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
      <div className="grid gap-4 lg:grid-cols-2">
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
    </div>
  );
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
  delta,
  Icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  delta?: number | null;
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
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br p-3.5 ring-1 ring-inset transition-transform hover:-translate-y-0.5",
        toneCls,
      )}
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-widest opacity-90">
          <Icon size={12} />
          {label}
        </span>
        {delta != null ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold",
              delta > 0
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-[var(--color-error)]/20 text-[var(--color-error)]",
            )}
          >
            {delta > 0 ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
            {delta > 0 ? "+" : ""}
            {delta}
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
    </div>
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
