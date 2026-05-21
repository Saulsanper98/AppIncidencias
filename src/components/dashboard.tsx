"use client";

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bus,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  LayoutDashboard,
  MapPinned,
  Monitor,
  RefreshCw,
  Search,
  TrendingUp,
  Wifi,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ConductorViewPanel } from "@/components/conductor-view-panel";
import { DashboardPreventiveAgenda } from "@/components/dashboard-preventive-agenda";
import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { Badge } from "@/components/ui/badge";
import { knowledgeShortcuts } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ActiveIncident = {
  id: string; busId: string; operator: string; assetType: string;
  status: "abierto" | "en_proceso" | "esperando_repuesto";
  priority: "alta" | "media" | "baja";
  slaDeadline: string; title: string;
};
type KpisData = {
  ticketsAbiertos: number; slaCompliancePercent: number | null;
  mttrMs: number | null; fleetAvailabilityPercent: number;
  resolvedCount30d: number; incidenciasActivas: ActiveIncident[];
  municipioStats: { name: string; count: number }[];
};
type TrendDay = { day: string; creados: number; resueltos: number };
type TrendSummary = {
  totalCreados: number; totalResueltos: number; promedioCreadosDia: number;
  peak: { day: string; creados: number } | null;
  topOperators: { busId: string; operator: string; creados: number }[];
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const TONE_STYLE = {
  critical: {
    borderColor: "rgba(220,38,38,0.4)",
    glow: "rgba(220,38,38,0.07)",
    bar: "bg-[var(--color-error)]",
    icon: "text-[var(--color-error)]",
    iconBg: "bg-[var(--color-error-light)]",
  },
  success: {
    borderColor: "rgba(5,150,105,0.4)",
    glow: "rgba(5,150,105,0.07)",
    bar: "bg-[var(--color-success)]",
    icon: "text-[var(--color-success)]",
    iconBg: "bg-[var(--color-success-light)]",
  },
  neutral: {
    borderColor: "rgba(37,99,235,0.3)",
    glow: "rgba(37,99,235,0.05)",
    bar: "bg-[var(--color-accent)]",
    icon: "text-[var(--color-accent)]",
    iconBg: "bg-[var(--color-accent-light)]",
  },
} as const;

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
const KPI_ICONS = [AlertCircle, TrendingUp, Clock, CheckCircle2] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatMttr(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function slaMinutesRemaining(deadlineIso: string): number {
  return Math.round((new Date(deadlineIso).getTime() - Date.now()) / 60000);
}

function relativeRefresh(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10) return "ahora mismo";
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  return `hace ${m} min`;
}

// ─── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, trend, tone, icon: Icon }: {
  label: string; value: string | null; trend: string;
  tone: "critical" | "neutral" | "success"; icon: React.ElementType;
}) {
  const t = TONE_STYLE[tone];
  return (
    <article
      className="relative overflow-hidden rounded-xl border p-5 transition-all duration-200 hover:shadow-lg hover:shadow-black/20"
      style={{
        borderColor: t.borderColor,
        background: `radial-gradient(ellipse at 80% 0%, ${t.glow} 0%, transparent 55%), var(--color-surface)`,
      }}
    >
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${t.bar}`} />
      <div className="mb-3 flex items-start justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.iconBg}`}>
          <Icon size={16} className={t.icon} />
        </div>
      </div>
      <div className="tabular-nums text-3xl font-bold text-[var(--color-text-1)]">
        {value === null
          ? <span className="inline-block h-8 w-20 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
          : value}
      </div>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">{label}</p>
      <p className="mt-2 text-xs text-[var(--color-text-3)]">{trend}</p>
    </article>
  );
}

// ─── Incident card row ──────────────────────────────────────────────────────────

function IncidentCard({ ticket }: { ticket: ActiveIncident }) {
  const slaMin = slaMinutesRemaining(ticket.slaDeadline);
  const pm = PRIORITY_META[ticket.priority];
  const expired = slaMin <= 0;
  const urgent = !expired && slaMin < 30;
  const nearby = !expired && !urgent && slaMin < 120;

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 transition-all duration-150 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-2)]/40 hover:shadow-md hover:shadow-black/15"
      style={{ borderLeftWidth: "3px", borderLeftColor: pm?.color }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-[var(--color-accent)]">{ticket.id.slice(0, 8)}</span>
          <span className="text-[var(--color-text-3)]">·</span>
          <span className="text-xs text-[var(--color-text-2)]">{ticket.assetType}</span>
        </div>
        <p className="mt-0.5 truncate text-sm font-medium text-[var(--color-text-1)]">{ticket.title}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-3)]">{ticket.busId} · {ticket.operator}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge variant={STATUS_VARIANT[ticket.status] ?? "neutral"}>
          {STATUS_LABEL[ticket.status] ?? ticket.status}
        </Badge>
        {expired ? (
          <span className="text-xs font-semibold text-[var(--color-error)]">SLA vencido</span>
        ) : (
          <span className={cn(
            "flex items-center gap-1 text-xs tabular-nums",
            urgent ? "font-semibold text-[var(--color-error)]" :
            nearby ? "text-[var(--color-warning)]" :
            "text-[var(--color-text-3)]",
          )}>
            {urgent && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-error)]" />}
            {slaMin} min
          </span>
        )}
      </div>
      <ChevronRight size={14} className="shrink-0 text-[var(--color-text-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]" />
    </Link>
  );
}

// ─── Municipality bar list ──────────────────────────────────────────────────────

function MunicipalityList({ stats }: { stats: { name: string; count: number }[] }) {
  const max = Math.max(...stats.map((s) => s.count), 1);
  return (
    <ul className="space-y-2.5">
      {stats.map((item) => (
        <li key={item.name} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-2)]">{item.name}</span>
            <span className={cn(
              "font-semibold tabular-nums",
              item.count >= 6 ? "text-[var(--color-error)]" :
              item.count >= 3 ? "text-[var(--color-warning)]" :
              "text-[var(--color-success)]",
            )}>{item.count}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                item.count >= 6 ? "bg-[var(--color-error)]" :
                item.count >= 3 ? "bg-[var(--color-warning)]" :
                "bg-[var(--color-success)]",
              )}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function Dashboard() {
  const searchParams = useSearchParams();
  const [kpis, setKpis] = useState<KpisData | null>(null);
  const [trend, setTrend] = useState<TrendDay[] | null>(null);
  const [trendSummary, setTrendSummary] = useState<TrendSummary | null>(null);
  const [trendDays, setTrendDays] = useState<7 | 14 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [dashboardView, setDashboardView] = useState<"operaciones" | "conductor">("operaciones");

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
    if (manual) setRefreshing(true); else setLoading(true);
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
    } catch { /* silently degrade */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [trendDays]);

  useEffect(() => { void load(); }, [load]);

  const kpiCards = [
    {
      label: "Tickets Abiertos",
      value: loading ? null : String(kpis?.ticketsAbiertos ?? "—"),
      trend: kpis ? `${kpis.resolvedCount30d} resueltos en 30d` : "—",
      tone: ((kpis?.ticketsAbiertos ?? 0) > 10 ? "critical" : "neutral") as "critical" | "neutral" | "success",
    },
    {
      label: "Disponibilidad Flota",
      value: loading ? null : kpis ? `${kpis.fleetAvailabilityPercent}%` : "—",
      trend: "buses sin incidencia activa",
      tone: ((kpis?.fleetAvailabilityPercent ?? 100) >= 90 ? "success" : "critical") as "critical" | "neutral" | "success",
    },
    {
      label: "MTTR",
      value: loading ? null : formatMttr(kpis?.mttrMs ?? null),
      trend: "tiempo medio de resolución",
      tone: "neutral" as const,
    },
    {
      label: "SLA Cumplido",
      value: loading ? null : kpis?.slaCompliancePercent != null ? `${kpis.slaCompliancePercent}%` : "—",
      trend: "últimos 30 días",
      tone: (kpis?.slaCompliancePercent != null
        ? kpis.slaCompliancePercent >= 85 ? "success" : "critical"
        : "neutral") as "critical" | "neutral" | "success",
    },
  ];

  const activeCount = kpis?.incidenciasActivas.length ?? 0;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-1)]">
            {dashboardView === "conductor" ? "Vista conductor" : "Panel operativo"}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-2)]">
            {dashboardView === "conductor"
              ? "Resumen rápido para personal de campo"
              : "Control en tiempo real · Flota de Gran Canaria"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Live indicator + refresh */}
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-success)]" />
            <span className="text-xs text-[var(--color-text-3)]">{relativeRefresh(lastRefresh)}</span>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing || loading}
              title="Actualizar datos"
              className="ml-0.5 flex items-center justify-center text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-1)] disabled:opacity-40"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>

          {/* View switcher */}
          <div className="flex gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
            {(["operaciones", "conductor"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => syncUrlView(v)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
                  dashboardView === v
                    ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-text-1)]"
                    : "text-[var(--color-text-3)] hover:text-[var(--color-text-2)]",
                )}
              >
                {v === "operaciones" ? <LayoutDashboard size={12} /> : <Bus size={12} />}
                {v === "operaciones" ? "Operaciones" : "Conductor"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {dashboardView === "conductor" ? (
        <ConductorViewPanel />
      ) : (
        <section className="space-y-5">

          {/* ── KPIs ── */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">Métricas operativas</p>
              <FeedbackTargetButton id="dashboard/kpis" label="KPIs operativos" />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {kpiCards.map((kpi, idx) => (
                <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} trend={kpi.trend} tone={kpi.tone} icon={KPI_ICONS[idx] ?? AlertCircle} />
              ))}
            </div>
          </div>

          {/* ── Incidents + Chart ── */}
          <div className="grid min-h-0 gap-4 lg:grid-cols-[1fr_340px] lg:items-start">

            {/* Incidents */}
            <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-1)]">Incidencias activas</h3>
                  <p className="mt-0.5 text-xs text-[var(--color-text-3)]">Ordenadas por prioridad SLA</p>
                </div>
                <div className="flex items-center gap-2">
                  <FeedbackTargetButton id="dashboard/incidencias-activas" label="Tabla de incidencias activas" />
                  {!loading && activeCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(220,38,38,0.3)] bg-[var(--color-error-light)] px-2 py-0.5 text-xs font-semibold text-[var(--color-error)]">
                      <AlertTriangle size={11} />
                      {activeCount}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {loading ? (
                  [1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3.5">
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <div className="h-3 w-20 animate-pulse rounded bg-[var(--color-surface-2)]" />
                          <div className="h-3 w-16 animate-pulse rounded bg-[var(--color-surface-2)]" />
                        </div>
                        <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--color-surface-2)]" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-surface-2)]" />
                      </div>
                      <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
                    </div>
                  ))
                ) : kpis?.incidenciasActivas.length ? (
                  kpis.incidenciasActivas.map((ticket) => <IncidentCard key={ticket.id} ticket={ticket} />)
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

            {/* Trend chart */}
            <article className="flex min-h-[380px] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:h-full lg:min-h-0">
              <div className="mb-3 shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-[var(--color-text-1)]">Tendencia</h3>
                      <p className="mt-0.5 text-xs text-[var(--color-text-3)]">Últimos {trendDays} días</p>
                    </div>
                    <FeedbackTargetButton id="dashboard/tendencia-tickets" label="Gráfico de tendencia de tickets" className="mt-0.5" />
                  </div>
                  <div className="flex gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
                    {([7, 14, 30] as const).map((d) => (
                      <button key={d} type="button" onClick={() => setTrendDays(d)}
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all duration-150",
                          trendDays === d
                            ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-text-1)]"
                            : "text-[var(--color-text-3)] hover:text-[var(--color-text-2)]",
                        )}
                      >{d}d</button>
                    ))}
                  </div>
                </div>

                {trendSummary && !loading && (
                  <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
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
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                <div className="relative min-h-[180px] flex-1 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend ?? []} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradCreados" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#DC2626" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#DC2626" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradResueltos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.07)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: "var(--color-text-3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--color-text-3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-surface-3)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "10px",
                          fontSize: "12px",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                        }}
                        labelStyle={{ color: "var(--color-text-1)", fontWeight: 600, marginBottom: 4 }}
                        itemStyle={{ color: "var(--color-text-2)" }}
                        cursor={{ stroke: "rgba(148,163,184,0.12)", strokeWidth: 1 }}
                      />
                      <Area type="monotone" dataKey="creados" name="Creados"
                        stroke="#DC2626" fill="url(#gradCreados)" strokeWidth={2}
                        dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#DC2626" }}
                      />
                      <Area type="monotone" dataKey="resueltos" name="Resueltos"
                        stroke="#059669" fill="url(#gradResueltos)" strokeWidth={2}
                        dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#059669" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
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
          </div>

          {/* ── Bottom row ── */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

            {/* Map */}
            <Link href="/mapa"
              className="group flex min-h-[220px] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all duration-200 hover:border-[var(--color-border-hover)] hover:shadow-md hover:shadow-black/15"
              style={{ background: "radial-gradient(ellipse at 90% 0%, rgba(37,99,235,0.05) 0%, transparent 55%), var(--color-surface)" }}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-light)]">
                    <MapPinned size={15} className="text-[var(--color-accent)]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-1)]">Mapa de incidencias</h3>
                </div>
                <ChevronRight size={14} className="text-[var(--color-text-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]" />
              </div>
              <div className="flex-1">
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between">
                          <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--color-surface-2)]" />
                          <div className="h-3 w-6 animate-pulse rounded bg-[var(--color-surface-2)]" />
                        </div>
                        <div className="h-1.5 w-full animate-pulse rounded-full bg-[var(--color-surface-2)]" />
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

            {/* Preventive agenda */}
            <DashboardPreventiveAgenda />

            {/* Knowledge base */}
            <article className="min-h-[220px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
                    <Search size={14} className="text-[var(--color-text-3)]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-1)]">Conocimiento</h3>
                </div>
                <FeedbackTargetButton id="dashboard/base-conocimiento" label="Base de conocimiento" />
              </div>
              <div className="space-y-1.5">
                {knowledgeShortcuts.map((entry, i) => {
                  const Icon = SHORTCUT_ICONS[i] ?? BookOpen;
                  return (
                    <button key={entry}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left transition-all duration-150 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)]"
                    >
                      <Icon size={13} className="shrink-0 text-[var(--color-text-3)]" />
                      <span className="line-clamp-1 flex-1 text-xs text-[var(--color-text-2)]">{entry}</span>
                      <ChevronRight size={12} className="shrink-0 text-[var(--color-text-3)]" />
                    </button>
                  );
                })}
              </div>
            </article>

            {/* Ticket flow */}
            <article className="min-h-[220px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
                  <Wrench size={14} className="text-[var(--color-text-3)]" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--color-text-1)]">Flujo de ticketing</h3>
              </div>
              <div>
                {FLOW_STEPS.map((step, i) => (
                  <div key={step.label}>
                    <div className="flex items-center gap-3 py-1.5">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${step.bg}`}>
                        <step.icon size={14} className={step.color} />
                      </div>
                      <span className="text-sm text-[var(--color-text-2)]">{step.label}</span>
                    </div>
                    {i < FLOW_STEPS.length - 1 && (
                      <div className="ml-4 h-3 w-px bg-[var(--color-border)]" />
                    )}
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      )}
    </div>
  );
}
