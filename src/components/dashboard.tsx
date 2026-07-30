"use client";

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  MapPinned,
  Monitor,
  Moon,
  Search,
  Sun,
  Sunrise,
  TrendingUp,
  Wifi,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { TrendDualAreaChart } from "@/components/dashboard-builder/trend-dual-area-chart";
import "@/app/(private)/dashboards/dashboard-builder.css";
import { ConductorViewPanel } from "@/components/conductor-view-panel";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { DashboardOperationalDetail } from "@/components/dashboard/DashboardOperationalDetail";
import type { ActiveIncident, KpisData, TrendDay, TrendSummary } from "@/components/dashboard/dashboard-types";
import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { RecentHandoversCard } from "@/components/recent-handovers-card";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/count-up";
import { DashboardViewSkeleton } from "@/components/ui/view-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  abierto: "Abierto", en_proceso: "En proceso",
  esperando_repuesto: "Esp. repuesto", resuelto: "Resuelto",
};
const STATUS_VARIANT: Record<string, "error" | "warning" | "info" | "success" | "neutral"> = {
  abierto: "error", en_proceso: "warning",
  esperando_repuesto: "info", resuelto: "success",
};
const PRIORITY_META: Record<string, { color: string }> = {
  alta:  { color: "var(--color-error)" },
  media: { color: "var(--color-warning)" },
  baja:  { color: "var(--color-success)" },
};
const FLOW_STEPS = [
  { label: "Abierto",        icon: AlertCircle,  color: "text-[var(--color-error)]",   bg: "bg-[var(--color-error-light)]" },
  { label: "En proceso",     icon: Activity,     color: "text-[var(--color-warning)]", bg: "bg-[var(--color-warning-light)]" },
  { label: "Esp. repuesto",  icon: Clock,        color: "text-[var(--color-accent)]",  bg: "bg-[var(--color-accent-light)]" },
  { label: "Resuelto",       icon: CheckCircle2, color: "text-[var(--color-success)]", bg: "bg-[var(--color-success-light)]" },
] as const;
const SHORTCUT_ICONS = [Cpu, Wifi, Activity, Monitor] as const;
const MAX_VISIBLE_INCIDENTS = 6;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function slaMinutesRemaining(deadlineIso: string): number {
  return Math.round((new Date(deadlineIso).getTime() - Date.now()) / 60000);
}

// ─── Incident card row ──────────────────────────────────────────────────────────

/** Formato compacto del tiempo restante: "Xh Ym" o "Xm". */
function formatRemaining(min: number): string {
  const abs = Math.abs(min);
  if (abs < 60) return `${abs}m`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function IncidentCard({ ticket }: { ticket: ActiveIncident }) {
  const slaMin = slaMinutesRemaining(ticket.slaDeadline);
  const pm = PRIORITY_META[ticket.priority];
  const expired = slaMin <= 0;
  const urgent = !expired && slaMin < 30;
  const nearby = !expired && !urgent && slaMin < 120;

  const priorityChipClass = cn(
    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
    ticket.priority === "alta"
      ? "bg-[var(--color-error-light)] text-[var(--color-error)]"
      : ticket.priority === "media"
        ? "bg-[var(--color-warning-light)] text-[var(--color-warning)]"
        : "bg-[var(--color-success-light)] text-[var(--color-success)]",
  );

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="group flex items-center gap-2 px-1 py-2.5 transition-colors hover:bg-[color-mix(in_oklab,var(--color-surface-2)_55%,transparent)] sm:gap-3 sm:px-1.5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={priorityChipClass}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: pm?.color }} />
            {ticket.priority}
          </span>
          <span className="num-tabular font-mono text-[10px] font-semibold text-[var(--color-text-3)]">
            {ticket.id.slice(-8).toUpperCase()}
          </span>
          <Badge variant={STATUS_VARIANT[ticket.status] ?? "neutral"} className="!border-0 !px-1.5 !py-0 text-[10px]">
            {STATUS_LABEL[ticket.status] ?? ticket.status}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[13px] font-medium leading-snug text-[var(--color-text-1)] group-hover:text-[var(--color-accent)]">
          {ticket.title}
        </p>
        <p className="truncate text-[11px] text-[var(--color-text-3)]">
          {ticket.busId} · {ticket.operator}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {expired ? (
          <span
            className="num-tabular whitespace-nowrap text-[10px] font-semibold text-[var(--color-error)] sm:text-[11px]"
            title={`SLA vencido hace ${formatRemaining(slaMin)}`}
          >
            SLA vencido
          </span>
        ) : (
          <span
            className={cn(
              "num-tabular flex items-center gap-1 whitespace-nowrap text-[10px] sm:text-[11px]",
              urgent ? "font-semibold text-[var(--color-error)]" :
              nearby ? "text-[var(--color-warning)]" :
              "text-[var(--color-text-3)]",
            )}
            title={`Quedan ${formatRemaining(slaMin)} hasta SLA`}
          >
            {urgent && <span className="ccmgc-pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--color-error)]" />}
            <Clock size={10} strokeWidth={1.5} className="opacity-70" />
            {formatRemaining(slaMin)}
          </span>
        )}
      </div>
      <ChevronRight size={13} strokeWidth={1.5} className="hidden shrink-0 text-[var(--color-text-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)] sm:block" />
    </Link>
  );
}

// ─── Municipality bar list ──────────────────────────────────────────────────────

function MunicipalityList({ stats }: { stats: { name: string; count: number }[] }) {
  const max = Math.max(...stats.map((s) => s.count), 1);
  return (
    <ul className="space-y-2.5">
      {stats.map((item) => {
        const colorClass =
          item.count >= 6
            ? "text-[var(--color-error)]"
            : item.count >= 3
              ? "text-[var(--color-warning)]"
              : "text-[var(--color-success)]";
        const barClass =
          item.count >= 6
            ? "bg-gradient-to-r from-[var(--color-error)]/85 to-[var(--color-error)]"
            : item.count >= 3
              ? "bg-gradient-to-r from-[var(--color-warning)]/85 to-[var(--color-warning)]"
              : "bg-gradient-to-r from-[var(--color-success)]/85 to-[var(--color-success)]";
        return (
          <li key={item.name} className="space-y-1">
            <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--color-text-2)]">
                <MapPinned size={10} strokeWidth={1.8} className={cn("shrink-0 opacity-80", colorClass)} aria-hidden />
                <span className="truncate" title={item.name}>{item.name}</span>
              </span>
              <span className={cn("font-semibold tabular-nums", colorClass)}>{item.count}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div
                className={cn("h-full rounded-full transition-all duration-700", barClass)}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Status funnel (mini bars by state) ─────────────────────────────────────────

function StatusFunnel({
  loading,
  statusCounts,
}: {
  loading: boolean;
  statusCounts: Record<string, number>;
}) {
  const rows = FLOW_STEPS.map((step, i) => {
    const key = ["abierto", "en_proceso", "esperando_repuesto", "resuelto"][i];
    const count = statusCounts[key] ?? 0;
    return { label: step.label, icon: step.icon, color: step.color, bg: step.bg, count, key };
  });
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
        return (
          <li
            key={r.key}
            className="group flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-surface-2)]/40"
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1",
                r.bg,
                r.key === "abierto"
                  ? "ring-[var(--color-error)]/20"
                  : r.key === "en_proceso"
                    ? "ring-[var(--color-warning)]/20"
                    : r.key === "esperando_repuesto"
                      ? "ring-[var(--color-accent)]/20"
                      : "ring-[var(--color-success)]/20",
              )}
            >
              <r.icon size={13} strokeWidth={1.7} className={r.color} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--color-text-2)]">
              {r.label}
            </span>
            {loading ? (
              <Skeleton className="h-4 w-8 rounded" />
            ) : (
              <span className="inline-flex items-baseline gap-1">
                <span className="num-tabular text-[15px] font-semibold leading-none text-[var(--color-text-1)]">
                  <CountUp value={r.count} durationMs={400} />
                </span>
                {total > 0 ? (
                  <span className="text-[10px] font-medium text-[var(--color-text-3)]">{pct}%</span>
                ) : null}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function Dashboard() {
  const searchParams = useSearchParams();
  const [kpis, setKpis] = useState<KpisData | null>(null);
  const [trend, setTrend] = useState<TrendDay[] | null>(null);
  const [trendSummary, setTrendSummary] = useState<TrendSummary | null>(null);
  const [trendDays, setTrendDays] = useState<7 | 14 | 30 | 90>(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshOk, setRefreshOk] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [dashboardView, setDashboardView] = useState<"operaciones" | "conductor">("operaciones");
  const [kbShortcuts, setKbShortcuts] = useState<{ label: string; slug: string }[]>([]);
  const [kbShortcutsLoaded, setKbShortcutsLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/kb/shortcuts", { cache: "no-store" });
        if (!res.ok) {
          setKbShortcuts([]);
          setKbShortcutsLoaded(true);
          return;
        }
        const data = (await res.json()) as { shortcuts: { label: string; slug: string }[] };
        setKbShortcuts(data.shortcuts ?? []);
      } catch {
        setKbShortcuts([]);
      } finally {
        setKbShortcutsLoaded(true);
      }
    })();
  }, []);

  const syncUrlView = useCallback((next: "operaciones" | "conductor") => {
    setDashboardView(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "conductor") url.searchParams.set("vista", "conductor");
    else url.searchParams.delete("vista");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);

  useEffect(() => {
    if (searchParams.get("vista") === "conductor") setDashboardView("conductor");
  }, [searchParams]);

  const load = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshing(true);
      setRefreshOk(false);
    } else setLoading(true);
    try {
      const [kpisRes, trendRes] = await Promise.all([
        fetch("/api/dashboard/kpis", { cache: "no-store" }),
        fetch(`/api/dashboard/trend?days=${trendDays}`, { cache: "no-store" }),
      ]);
      if (kpisRes.ok) setKpis((await kpisRes.json()) as KpisData);
      if (trendRes.ok) {
        const j = (await trendRes.json()) as { trend: TrendDay[]; summary: TrendSummary };
        setTrend(j.trend); setTrendSummary(j.summary);
      }
      setLastRefresh(new Date());
      if (manual) {
        setRefreshOk(true);
        window.setTimeout(() => setRefreshOk(false), 1400);
      }
    } catch { /* silently degrade */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [trendDays]);

  useEffect(() => { void load(); }, [load]);

  const activeCount = kpis?.incidenciasActivas.length ?? 0;

  if (loading && !kpis) {
    return <DashboardViewSkeleton />;
  }

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <DashboardHero
        dashboardView={dashboardView}
        onViewChange={syncUrlView}
        loading={loading}
        refreshing={refreshing}
        refreshOk={refreshOk}
        lastRefresh={lastRefresh}
        onRefresh={() => void load(true)}
        kpis={kpis}
      />

      {dashboardView === "conductor" ? (
        <div key="conductor" className="dashboard-view-fade">
          <ConductorViewPanel />
        </div>
      ) : (
        <section key="operaciones" className="dashboard-view-fade space-y-5">

          {/* ── Incidents + Chart ── */}
          <div className="grid min-h-0 gap-4 lg:grid-cols-[1fr_340px] lg:items-start">

            {/* Incidents */}
            <article className="account-section ccmgc-stagger-in ccmgc-stagger-in-5">
              <FeedbackTargetButton
                placement="corner"
                id="dashboard/incidencias-activas"
                label="Tabla de incidencias activas"
              />
              <header className="account-section-head !mb-4 !items-start pr-9 sm:!items-center">
                <span className="account-section-icon shrink-0">
                  <AlertTriangle size={16} strokeWidth={1.6} className="text-[var(--color-error)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="account-section-pretitle">
                    <span className="account-section-pretitle-dot ccmgc-eyebrow-dot--pulse" aria-hidden />
                    Cola activa
                  </p>
                  <h2 className="account-section-title !mt-0">Incidencias activas</h2>
                  <p className="mt-0.5 text-xs text-[var(--color-text-3)]">Ordenadas por prioridad SLA</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!loading && activeCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(220,38,38,0.3)] bg-[var(--color-error-light)] px-2 py-0.5 text-xs font-semibold text-[var(--color-error)]">
                      <AlertTriangle size={11} />
                      {activeCount}
                    </span>
                  )}
                </div>
              </header>

              <div className="divide-y divide-[color-mix(in_oklab,var(--color-border)_55%,transparent)]">
                {loading ? (
                  [1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-2 px-1 py-2.5">
                      <div className="flex-1 space-y-1.5">
                        <div className="flex gap-2">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3 w-14" />
                        </div>
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-4 w-14" />
                    </div>
                  ))
                ) : kpis?.incidenciasActivas.length ? (
                  <>
                    {kpis.incidenciasActivas.slice(0, MAX_VISIBLE_INCIDENTS).map((ticket) => (
                      <IncidentCard key={ticket.id} ticket={ticket} />
                    ))}
                    {kpis.incidenciasActivas.length > MAX_VISIBLE_INCIDENTS ? (
                      <Link
                        href="/bandeja"
                        className="mt-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium text-[var(--color-accent)] transition-colors hover:underline"
                      >
                        Ver {kpis.incidenciasActivas.length - MAX_VISIBLE_INCIDENTS} más en bandeja
                        <ArrowRight size={12} />
                      </Link>
                    ) : null}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success-light)]">
                      <CheckCircle2 size={24} className="text-[var(--color-success)]" />
                    </div>
                    <p className="font-medium text-[var(--color-text-2)]">Sin incidencias activas</p>
                    <p className="mt-1 text-xs text-[var(--color-text-3)]">La flota opera con normalidad</p>
                  </div>
                )}
              </div>
            </article>

            {/* Columna derecha: Tendencia + Carga por turno apiladas. La
             *  envolvemos en un flex-col para que ambas cards compartan la
             *  segunda columna del grid, manteniendo cada una su altura
             *  fija (la curva no se estira, la carga es compacta). */}
            <div className="flex flex-col gap-4">
            {/* Trend chart
             *
             *  La card antes tenía `lg:h-full lg:min-h-0` para alinear su alto
             *  con el de "Incidencias activas" en la columna izquierda. El
             *  problema es que cuando la columna izquierda crece (8 o más
             *  incidencias visibles), la card de la derecha también crecía y
             *  estiraba el AreaChart verticalmente hasta deformar la curva.
             *
             *  Necesitamos altura CONCRETA (no min/max) en el ancestro para
             *  que `ResponsiveContainer` de Recharts (height="100%") y los
             *  `flex-1` anidados puedan resolver. Por eso fijamos
             *  `h-[380px]` en mobile y `lg:h-[460px]` en desktop: la curva
             *  se ve siempre y no se estira con la columna vecina.
             */}
            <article className="account-section ccmgc-stagger-in ccmgc-stagger-in-5 flex h-[340px] min-w-0 flex-col overflow-hidden lg:h-[420px]">
              <FeedbackTargetButton
                placement="corner"
                id="dashboard/tendencia-tickets"
                label="Gráfico de tendencia de tickets"
              />
              <header className="account-section-head !mb-3 shrink-0 flex-wrap items-start gap-y-2 pr-9">
                <span className="account-section-icon shrink-0">
                  <TrendingUp size={16} strokeWidth={1.6} className="text-[var(--color-accent)]" />
                </span>
                <div className="min-w-0 flex-1 basis-[120px]">
                  <p className="account-section-pretitle">
                    <span className="account-section-pretitle-dot" aria-hidden />
                    Evolución
                  </p>
                  <h2 className="account-section-title !mt-0">Tendencia</h2>
                  <p className="mt-0.5 text-xs text-[var(--color-text-3)]">Últimos {trendDays} días</p>
                </div>
                <div className="ml-auto flex shrink-0 items-center">
                  <div className="flex shrink-0 gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
                    {([7, 14, 30, 90] as const).map((d) => (
                      <button key={d} type="button" onClick={() => setTrendDays(d)}
                        className={cn(
                          "rounded-lg px-2 py-1 text-[11px] font-medium transition-all duration-150 sm:px-2.5",
                          trendDays === d
                            ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-text-1)]"
                            : "text-[var(--color-text-3)] hover:text-[var(--color-text-2)]",
                        )}
                      >{d}d</button>
                    ))}
                  </div>
                </div>
              </header>

              {trendSummary && !loading && (
                <div className="mb-3 flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span className="text-[var(--color-text-3)]">
                    <span className="font-semibold text-[var(--color-text-1)]">{trendSummary.totalCreados}</span> creados
                  </span>
                  <span className="text-[var(--color-text-3)]">
                    <span className="font-semibold text-[var(--color-text-1)]">{trendSummary.totalResueltos}</span> resueltos
                  </span>
                  <span className="text-[var(--color-text-3)]">
                    media <span className="font-semibold text-[var(--color-text-1)]">{trendSummary.promedioCreadosDia}</span>/día
                  </span>
                  {trendSummary.peak && trendSummary.peak.creados > 0 && (
                    <span className="text-[var(--color-text-3)]">
                      pico <span className="font-semibold text-[var(--color-text-1)]">{trendSummary.peak.creados}</span> el {trendSummary.peak.day}
                    </span>
                  )}
                </div>
              )}

              <div className="flex min-h-0 flex-1 flex-col">
                <div className="relative min-h-[180px] flex-1 w-full">
                  <TrendDualAreaChart data={trend ?? []} height="100%" idPrefix="dashboard-main" />
                </div>
                {(trend?.length ?? 0) > 16 ? (
                  <p className="mt-1.5 shrink-0 text-[10px] text-[var(--color-text-3)]">
                    Arrastra el selector inferior para acotar el periodo visible.
                  </p>
                ) : null}
                <div className="mt-3 flex gap-4 shrink-0 text-[11px]">
                  <span className="flex items-center gap-1.5 text-[var(--color-text-3)]">
                    <span className="h-2 w-2 rounded-full bg-[#DC2626]" /> Creados
                  </span>
                  <span className="flex items-center gap-1.5 text-[var(--color-text-3)]">
                    <span className="h-2 w-2 rounded-full bg-[#059669]" /> Resueltos
                  </span>
                </div>
              </div>
            </article>

            <ShiftLoadCard loading={loading} shiftLoadToday={kpis?.shiftLoadToday} />
            </div>
          </div>

          <DashboardOperationalDetail loading={loading} kpis={kpis} />

          {/* ── Bottom row ── */}
          <div className="ccmgc-stagger-in ccmgc-stagger-in-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

            {/* Map */}
            <Link href="/mapa" className="account-section group flex min-h-[200px] flex-col transition-shadow hover:shadow-md">
              <header className="account-section-head !mb-3">
                <span className="account-section-icon shrink-0">
                  <MapPinned size={15} className="text-[var(--color-accent)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="account-section-pretitle">
                    <span className="account-section-pretitle-dot" aria-hidden />
                    Geolocalización
                  </p>
                  <h3 className="account-section-title !mt-0">Mapa de incidencias</h3>
                </div>
                <ChevronRight size={14} className="shrink-0 text-[var(--color-text-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]" />
              </header>
              <div className="flex-1">
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between">
                          <Skeleton className="h-3 w-3/4" />
                          <Skeleton className="h-3 w-6" />
                        </div>
                        <Skeleton className="h-1.5 w-full rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : kpis?.municipioStats.length ? (
                  <MunicipalityList stats={kpis.municipioStats} />
                ) : (
                  <p className="text-sm text-[var(--color-text-3)]">Sin incidencias por zona</p>
                )}
              </div>
              <p className="mt-4 flex items-center gap-1 text-xs font-medium text-[var(--color-accent)]">
                Abrir mapa <ArrowRight size={11} />
              </p>
            </Link>

            {/* Últimos pases de turno (M/T/N) — reemplaza a la antigua
             *  "Agenda de hoy" (preventivo) ahora que inventario y preventivo
             *  se gestionan exclusivamente en su propia sección. */}
            <RecentHandoversCard />

            {/* Knowledge base */}
            <article className="account-section min-h-[200px] transition-shadow hover:shadow-md">
              <FeedbackTargetButton
                placement="corner"
                id="dashboard/base-conocimiento"
                label="Base de conocimiento"
              />
              <header className="account-section-head !mb-3 pr-9">
                <span className="account-section-icon shrink-0">
                  <Search size={14} className="text-[var(--color-text-3)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="account-section-pretitle">
                    <span className="account-section-pretitle-dot" aria-hidden />
                    Base de conocimiento
                  </p>
                  <h3 className="account-section-title !mt-0">Conocimiento</h3>
                </div>
              </header>
              <div className="space-y-1.5">
                {!kbShortcutsLoaded ? (
                  [0, 1, 2].map((i) => (
                    <div key={`kb-skeleton-${i}`} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
                      <Skeleton className="h-6 w-full" />
                    </div>
                  ))
                ) : kbShortcuts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-4 text-center">
                    <p className="text-xs font-medium text-[var(--color-text-2)]">Sin atajos disponibles</p>
                    <p className="mt-1 text-[11px] text-[var(--color-text-3)]">
                      No se pudieron cargar accesos rápidos de conocimiento.
                    </p>
                  </div>
                ) : kbShortcuts.map((entry, i) => {
                  const Icon = SHORTCUT_ICONS[i] ?? BookOpen;
                  const inner = (
                    <>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-3)] ring-1 ring-[var(--color-border)] transition-colors group-hover:bg-[var(--color-accent-light)] group-hover:ring-[var(--color-accent)]/30">
                        <Icon size={12} strokeWidth={1.7} className="text-[var(--color-text-3)] transition-colors group-hover:text-[var(--color-accent)]" />
                      </span>
                      <span className="line-clamp-1 flex-1 text-xs text-[var(--color-text-2)] transition-colors group-hover:text-[var(--color-text-1)]">
                        {entry.label}
                      </span>
                      <ChevronRight
                        size={12}
                        className="shrink-0 text-[var(--color-text-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
                      />
                    </>
                  );
                  return entry.slug ? (
                    <Link
                      key={`${entry.slug}-${i}`}
                      href={`/kb/${entry.slug}`}
                      className="group flex w-full items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left transition-all duration-150 hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-accent-light)]/30"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      key={entry.label}
                      type="button"
                      className="group flex w-full items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left transition-all duration-150 hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-accent-light)]/30"
                    >
                      {inner}
                    </button>
                  );
                })}
              </div>
            </article>

            {/* Estados de tickets (mini-funnel): muestra conteo por estado
             *  con barras horizontales proporcionales al máximo. Cubre el
             *  hueco del antiguo "Flujo de ticketing" (lista plana sin datos). */}
            <article className="account-section min-h-[200px] transition-shadow hover:shadow-md">
              <header className="account-section-head !mb-3">
                <span className="account-section-icon shrink-0">
                  <Wrench size={14} strokeWidth={1.5} className="text-[var(--color-text-3)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="account-section-pretitle">
                    <span className="account-section-pretitle-dot" aria-hidden />
                    Distribución
                  </p>
                  <h3 className="account-section-title !mt-0">Estados de tickets</h3>
                </div>
              </header>
              <StatusFunnel
                loading={loading}
                statusCounts={kpis?.statusCounts ?? {}}
              />
            </article>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── ShiftLoadCard ─────────────────────────────────────────────────────────────
//
// Compacta tarjeta debajo de la curva de tendencia: reparte los tickets
// creados HOY entre los tres turnos del centro (M / T / N) con su mini-barra
// horizontal y el icono correspondiente (amanecer / sol / luna).
//
// Sirve al gestor de sala para detectar de un vistazo en qué franja se está
// acumulando carga y decidir refuerzos. Los cortes (6/14/22) son los mismos
// que usa el formulario de "Pase de turno" (/handover) para mantener
// consistencia entre vistas.

type ShiftKey = "M" | "T" | "N";

const SHIFT_META: Record<
  ShiftKey,
  { label: string; range: string; Icon: typeof Sunrise; tone: string; bar: string }
> = {
  M: {
    label: "Mañana",
    range: "06:00 – 14:00",
    Icon: Sunrise,
    tone: "text-amber-300",
    bar: "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)",
  },
  T: {
    label: "Tarde",
    range: "14:00 – 22:00",
    Icon: Sun,
    tone: "text-sky-300",
    bar: "linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)",
  },
  N: {
    label: "Noche",
    range: "22:00 – 06:00",
    Icon: Moon,
    tone: "text-indigo-300",
    bar: "linear-gradient(90deg, #4f46e5 0%, #818cf8 100%)",
  },
};

function ShiftLoadCard({
  loading,
  shiftLoadToday,
}: {
  loading: boolean;
  shiftLoadToday?: { M: number; T: number; N: number };
}) {
  const data = shiftLoadToday ?? { M: 0, T: 0, N: 0 };
  const total = data.M + data.T + data.N;
  const max = Math.max(data.M, data.T, data.N, 1);
  const nowHour = new Date().getHours();
  const currentShift: ShiftKey =
    nowHour >= 6 && nowHour < 14 ? "M" : nowHour >= 14 && nowHour < 22 ? "T" : "N";

  return (
    <article className="ccmgc-card ccmgc-stagger-in ccmgc-stagger-in-5 flex flex-col p-4 sm:p-5">
      <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--color-text-1)]">Carga por turno</h3>
          <p className="text-[11px] text-[var(--color-text-3)]">
            Tickets creados hoy · {total} en total
          </p>
        </div>
        <div className="shrink-0 self-start rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-3)] sm:whitespace-nowrap">
          Ahora · {SHIFT_META[currentShift].label}
        </div>
      </header>

      <div className="flex flex-col gap-2.5">
        {(["M", "T", "N"] as ShiftKey[]).map((k) => {
          const meta = SHIFT_META[k];
          const value = data[k];
          const pct = total === 0 ? 0 : Math.round((value / max) * 100);
          const isCurrent = k === currentShift;
          return (
            <div key={k} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-white/[0.04]",
                  isCurrent ? "border-white/20" : "border-white/10",
                )}
              >
                <meta.Icon size={14} strokeWidth={1.6} className={meta.tone} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <span
                      className={cn(
                        "font-medium",
                        isCurrent ? "text-[var(--color-text-1)]" : "text-[var(--color-text-2)]",
                      )}
                    >
                      {meta.label}
                    </span>
                    <span className="hidden text-[10px] text-[var(--color-text-3)] sm:inline">{meta.range}</span>
                  </div>
                  <span
                    className={cn(
                      "tabular-nums text-[13px] font-semibold",
                      value === 0 ? "text-[var(--color-text-3)]" : "text-[var(--color-text-1)]",
                    )}
                  >
                    {loading ? "—" : value}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${loading ? 0 : pct}%`, background: meta.bar }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && total === 0 ? (
        <p className="mt-3 text-[11px] italic text-[var(--color-text-3)]">
          Sin tickets creados aún hoy.
        </p>
      ) : null}
    </article>
  );
}
