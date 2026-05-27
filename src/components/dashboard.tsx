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
  Eye,
  Info,
  LayoutDashboard,
  MapPinned,
  Monitor,
  Radio,
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
import { DailyReportButton } from "@/components/daily-report-button";
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
  statusCounts?: Record<string, number>;
  mttrByPriority?: { alta: number | null; media: number | null; baja: number | null };
  unassignedAgedCount?: number;
  topBuses?: { busId: string; ticketCount: number; operator: string | null; municipio: string | null }[];
};
type TrendDay = { day: string; creados: number; resueltos: number };
type TrendSummary = {
  totalCreados: number; totalResueltos: number; promedioCreadosDia: number;
  peak: { day: string; creados: number } | null;
  topOperators: { busId: string; operator: string; creados: number }[];
};

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Estilos por tono para los KPI. La idea premium es que el color se exprese
 * con un trazo finísimo en el borde inferior (`bar`) y el icono, NO con
 * fondos pintados que saturan la pantalla. `borderColor` queda casi neutro
 * para que las cards "respiren" igual entre sí; el matiz lo aporta `bar`.
 */
const TONE_STYLE = {
  critical: {
    borderColor: "var(--color-border)",
    bar: "bg-[var(--color-error)]",
    icon: "text-[var(--color-error)]",
    iconBg: "bg-[var(--color-error-light)]",
  },
  success: {
    borderColor: "var(--color-border)",
    bar: "bg-[var(--color-success)]",
    icon: "text-[var(--color-success)]",
    iconBg: "bg-[var(--color-success-light)]",
  },
  neutral: {
    borderColor: "var(--color-border)",
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

function KpiCard({
  label,
  value,
  trend,
  tone,
  icon: Icon,
  primary = false,
  staggerIndex,
  emptyHint,
}: {
  label: string;
  value: string | null;
  trend: string;
  tone: "critical" | "neutral" | "success";
  icon: React.ElementType;
  /** KPI principal: tamaño/peso visual mayor y acento en card. */
  primary?: boolean;
  /** Orden 1..6 para microanimaciones escalonadas (`prefers-reduced-motion` lo desactiva). */
  staggerIndex?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Texto que aparece como tooltip cuando el valor es "—" (sin datos). */
  emptyHint?: string;
}) {
  const t = TONE_STYLE[tone];
  const isEmpty = value === "—" || value === null;
  return (
    <article
      className={cn(
        "ccmgc-card group relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        primary && "ccmgc-card-accent",
        staggerIndex && `ccmgc-stagger-in ccmgc-stagger-in-${staggerIndex}`,
      )}
      title={isEmpty && emptyHint ? emptyHint : undefined}
    >
      {/* Glow sutil en hover: acento del tono solo cuando se interactúa. */}
      <div
        className={cn(
          "pointer-events-none absolute -top-12 -right-12 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-25",
          t.bar,
        )}
        aria-hidden
      />
      {/* Trazo de color del tono, único punto donde aparece a plena pureza. */}
      <div className={cn("absolute bottom-0 left-0 right-0", primary ? "h-[2px]" : "h-px", t.bar, "opacity-80")} />
      <div className="mb-3 flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex items-center justify-center rounded-xl ring-1 transition-transform duration-200 group-hover:scale-[1.04]",
            primary ? "h-11 w-11" : "h-9 w-9",
            t.iconBg,
            tone === "critical"
              ? "ring-[var(--color-error)]/20"
              : tone === "success"
                ? "ring-[var(--color-success)]/20"
                : "ring-[var(--color-accent)]/20",
          )}
        >
          <Icon size={primary ? 19 : 16} strokeWidth={1.6} className={t.icon} />
        </div>
        {/* Eyebrow label arriba a la derecha en lugar de debajo: jerarquía vertical clásica. */}
        <span
          className={cn(
            "text-eyebrow truncate",
            primary ? "text-[var(--color-text-2)]" : "text-[var(--color-text-3)]",
          )}
        >
          {label}
        </span>
      </div>
      <div
        className={cn(
          "num-tabular font-semibold tracking-tight",
          isEmpty ? "text-[var(--color-text-3)]" : "text-[var(--color-text-1)]",
          primary ? "text-[44px] leading-[1]" : "text-[30px] leading-[1.05]",
        )}
      >
        {value === null ? (
          <span
            className={cn(
              "inline-block animate-pulse rounded-lg bg-[var(--color-surface-2)]",
              primary ? "h-11 w-24" : "h-8 w-20",
            )}
          />
        ) : (
          value
        )}
      </div>
      <p
        className={cn(
          "mt-2 flex items-center gap-1 text-xs leading-relaxed",
          primary ? "text-[var(--color-text-2)]" : "text-[var(--color-text-3)]",
        )}
      >
        {isEmpty && emptyHint ? (
          <Info size={11} strokeWidth={1.5} className="shrink-0 text-[var(--color-text-3)]/70" />
        ) : null}
        <span className="truncate">{trend}</span>
      </p>
    </article>
  );
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
    "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
    ticket.priority === "alta"
      ? "border-[rgba(239,68,68,0.30)] bg-[var(--color-error-light)] text-[var(--color-error)]"
      : ticket.priority === "media"
        ? "border-[rgba(245,158,11,0.30)] bg-[var(--color-warning-light)] text-[var(--color-warning)]"
        : "border-[rgba(16,185,129,0.30)] bg-[var(--color-success-light)] text-[var(--color-success)]",
  );

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 transition-all duration-150 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-2)]/40 hover:shadow-md hover:shadow-black/15"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Chip de prioridad explícito: el usuario ya no tiene que adivinar
           *  qué significa la franja lateral. */}
          <span className={priorityChipClass}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: pm?.color }} />
            {ticket.priority}
          </span>
          <span className="num-tabular font-mono text-[11px] font-semibold text-[var(--color-text-2)]">
            {ticket.id.slice(-8).toUpperCase()}
          </span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-[var(--color-text-1)]">{ticket.title}</p>
        <p className="mt-0.5 truncate text-xs text-[var(--color-text-3)]">
          {ticket.busId} · {ticket.assetType} · {ticket.operator}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge variant={STATUS_VARIANT[ticket.status] ?? "neutral"}>
          {STATUS_LABEL[ticket.status] ?? ticket.status}
        </Badge>
        {expired ? (
          <span
            className="num-tabular text-xs font-semibold text-[var(--color-error)]"
            title={`SLA vencido hace ${formatRemaining(slaMin)}`}
          >
            SLA vencido
          </span>
        ) : (
          <span
            className={cn(
              "num-tabular flex items-center gap-1 text-xs",
              urgent ? "font-semibold text-[var(--color-error)]" :
              nearby ? "text-[var(--color-warning)]" :
              "text-[var(--color-text-3)]",
            )}
            title={`Quedan ${formatRemaining(slaMin)} hasta SLA`}
          >
            {urgent && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-error)]" />}
            <Clock size={11} strokeWidth={1.5} className="opacity-70" />
            {formatRemaining(slaMin)}
          </span>
        )}
      </div>
      <ChevronRight size={14} strokeWidth={1.5} className="shrink-0 text-[var(--color-text-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]" />
    </Link>
  );
}

// ─── Municipality bar list ──────────────────────────────────────────────────────

// ─── Operational extras row ────────────────────────────────────────────────────
//
// Tres tarjetas más finas que las KPIs principales: MTTR por prioridad,
// tickets sin asignar > 30 min, y top buses con más tickets en 30 días. Se
// renderizan después de la fila principal de KPIs en la vista de operaciones.

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem.toString().padStart(2, "0")}m`;
}

function OperationalKpiRow({
  loading,
  kpis,
}: {
  loading: boolean;
  kpis: KpisData | null;
}) {
  if (loading) {
    return (
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
          />
        ))}
      </div>
    );
  }
  if (!kpis) return null;

  const mttr = kpis.mttrByPriority ?? { alta: null, media: null, baja: null };
  const unassigned = kpis.unassignedAgedCount ?? 0;
  const topBuses = kpis.topBuses ?? [];

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* MTTR por prioridad */}
      <div className="ccmgc-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            MTTR por prioridad (30d)
          </p>
        </div>
        <ul className="space-y-2">
          {(["alta", "media", "baja"] as const).map((prio) => {
            const dotClass =
              prio === "alta"
                ? "bg-[var(--color-error)]"
                : prio === "media"
                  ? "bg-[var(--color-warning)]"
                  : "bg-[var(--color-success)]";
            const label = prio.charAt(0).toUpperCase() + prio.slice(1);
            return (
              <li key={prio} className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 text-[var(--color-text-2)]">
                  <span className={cn("h-2 w-2 rounded-full", dotClass)} aria-hidden />
                  {label}
                </span>
                <span className="font-semibold tabular-nums text-[var(--color-text-1)]">
                  {formatMs(mttr[prio])}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Sin asignar > 30 min */}
      <div
        className={cn(
          "ccmgc-card p-4",
          unassigned > 0 && "border-[var(--color-warning)]/40",
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
          Sin asignar (&gt; 30 min)
        </p>
        <p
          className={cn(
            "mt-2 text-3xl font-bold tabular-nums",
            unassigned > 0 ? "text-[var(--color-warning)]" : "text-[var(--color-text-1)]",
          )}
        >
          {unassigned}
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-3)]">
          {unassigned === 0
            ? "Cola atendida"
            : unassigned === 1
              ? "ticket abierto sin asignar"
              : "tickets abiertos sin asignar"}
        </p>
        <a
          href="/tickets?status=abierto"
          className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-accent)] hover:underline"
        >
          Ver bandeja
        </a>
      </div>

      {/* Top buses problemáticos */}
      <div className="ccmgc-card p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
          Top buses (30d)
        </p>
        {topBuses.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-3)]">Sin datos suficientes.</p>
        ) : (
          <ol className="mt-2 space-y-1.5">
            {topBuses.slice(0, 5).map((b, idx) => (
              <li
                key={b.busId}
                className="flex items-center justify-between gap-2 text-sm"
                title={[b.operator, b.municipio].filter(Boolean).join(" · ")}
              >
                <span className="flex min-w-0 items-center gap-2 text-[var(--color-text-2)]">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[10px] font-semibold tabular-nums text-[var(--color-text-3)]">
                    {idx + 1}
                  </span>
                  <a
                    href={`/tickets?busId=${encodeURIComponent(b.busId)}`}
                    className="truncate font-mono text-[13px] text-[var(--color-text-1)] hover:underline"
                  >
                    {b.busId}
                  </a>
                </span>
                <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-text-2)]">
                  {b.ticketCount}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

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
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-[var(--color-text-2)]">
                <MapPinned size={10} strokeWidth={1.8} className={cn("opacity-80", colorClass)} aria-hidden />
                {item.name}
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
              <span className="h-4 w-8 animate-pulse rounded bg-[var(--color-surface-2)]" />
            ) : (
              <span className="inline-flex items-baseline gap-1">
                <span className="num-tabular text-[15px] font-semibold leading-none text-[var(--color-text-1)]">
                  {r.count}
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
      label: "Tickets abiertos",
      value: loading ? null : String(kpis?.ticketsAbiertos ?? "—"),
      trend: kpis ? `${kpis.resolvedCount30d} resueltos en 30d` : "—",
      tone: ((kpis?.ticketsAbiertos ?? 0) > 10 ? "critical" : "neutral") as "critical" | "neutral" | "success",
      emptyHint: "Sin datos suficientes",
    },
    {
      label: "Disponibilidad flota",
      value: loading ? null : kpis ? `${kpis.fleetAvailabilityPercent}%` : "—",
      trend: "buses sin incidencia activa",
      tone: ((kpis?.fleetAvailabilityPercent ?? 100) >= 90 ? "success" : "critical") as "critical" | "neutral" | "success",
      emptyHint: "Sin datos suficientes",
    },
    {
      label: "MTTR",
      value: loading ? null : formatMttr(kpis?.mttrMs ?? null),
      trend: "Tiempo medio de resolución",
      tone: "neutral" as const,
      emptyHint: "Sin tickets resueltos en los últimos 30 días",
    },
    {
      label: "SLA cumplido",
      value: loading ? null : kpis?.slaCompliancePercent != null ? `${kpis.slaCompliancePercent}%` : "—",
      trend: "Últimos 30 días",
      tone: (kpis?.slaCompliancePercent != null
        ? kpis.slaCompliancePercent >= 85 ? "success" : "critical"
        : "neutral") as "critical" | "neutral" | "success",
      emptyHint: "Sin tickets resueltos para calcular SLA",
    },
  ];

  const activeCount = kpis?.incidenciasActivas.length ?? 0;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success-light)]/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-success)]"
              title="Datos actualizados en tiempo real"
            >
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-success)] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
              </span>
              En vivo
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
              {dashboardView === "conductor" ? "Vista de campo" : "Centro de control"}
            </span>
          </div>
          <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-[var(--color-text-1)]">
            {dashboardView === "conductor" ? "Vista conductor" : "Panel operativo"}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-2)]">
            {dashboardView === "conductor"
              ? "Resumen rápido para personal de campo"
              : "Control en tiempo real · Flota de Gran Canaria"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Informe diario para Jefatura */}
          <DailyReportButton />

          {/* Refresh con timestamp */}
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5">
            <Radio size={11} strokeWidth={1.8} className="text-[var(--color-success)]" aria-hidden />
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

          {/* View switcher con etiqueta explícita "Vista" para que se entienda
              de un vistazo qué hace el toggle. */}
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 pl-2.5">
            <Eye size={12} strokeWidth={1.5} className="text-[var(--color-text-3)]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">Vista</span>
            <div className="flex gap-0.5">
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
                  {v === "operaciones" ? <LayoutDashboard size={12} strokeWidth={1.5} /> : <Bus size={12} strokeWidth={1.5} />}
                  {v === "operaciones" ? "Operaciones" : "Conductor"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {dashboardView === "conductor" ? (
        <ConductorViewPanel />
      ) : (
        <section className="space-y-5">

          {/* ── KPIs (jerarquía: principal destacado + 3 secundarios) ── */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">Métricas operativas</p>
              <FeedbackTargetButton id="dashboard/kpis" label="KPIs operativos" />
            </div>
            {/*
             * Layout: 2×2 en mobile/tablet. En desktop el primer KPI ocupa
             * 3/6 de ancho (la mitad) y los 3 secundarios 1/6 cada uno. Eso
             * refuerza la jerarquía sin sacar al usuario de la cuadrícula.
             */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6 lg:auto-rows-fr">
              {kpiCards.map((kpi, idx) => (
                <div
                  key={kpi.label}
                  className={cn(
                    "col-span-1",
                    idx === 0 && "col-span-2 lg:col-span-3",
                    idx !== 0 && "lg:col-span-1",
                  )}
                >
                  <KpiCard
                    label={kpi.label}
                    value={kpi.value}
                    trend={kpi.trend}
                    tone={kpi.tone}
                    icon={KPI_ICONS[idx] ?? AlertCircle}
                    primary={idx === 0}
                    staggerIndex={((idx + 1) as 1 | 2 | 3 | 4)}
                    emptyHint={kpi.emptyHint}
                  />
                </div>
              ))}
            </div>

            <OperationalKpiRow loading={loading} kpis={kpis} />
          </div>

          {/* ── Incidents + Chart ── */}
          <div className="grid min-h-0 gap-4 lg:grid-cols-[1fr_340px] lg:items-start">

            {/* Incidents */}
            <article className="ccmgc-card ccmgc-stagger-in ccmgc-stagger-in-5 p-5">
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
            <article className="ccmgc-card ccmgc-stagger-in ccmgc-stagger-in-5 flex min-h-[380px] flex-col p-5 lg:h-full lg:min-h-0">
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
          <div className="ccmgc-stagger-in ccmgc-stagger-in-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

            {/* Map */}
            <Link href="/mapa" className="ccmgc-card group flex min-h-[220px] flex-col p-5">
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
            <article className="ccmgc-card min-h-[220px] p-5">
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
                    <button
                      key={entry}
                      className="group flex w-full items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left transition-all duration-150 hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-accent-light)]/30"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-3)] ring-1 ring-[var(--color-border)] transition-colors group-hover:bg-[var(--color-accent-light)] group-hover:ring-[var(--color-accent)]/30">
                        <Icon size={12} strokeWidth={1.7} className="text-[var(--color-text-3)] transition-colors group-hover:text-[var(--color-accent)]" />
                      </span>
                      <span className="line-clamp-1 flex-1 text-xs text-[var(--color-text-2)] transition-colors group-hover:text-[var(--color-text-1)]">
                        {entry}
                      </span>
                      <ChevronRight
                        size={12}
                        className="shrink-0 text-[var(--color-text-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
                      />
                    </button>
                  );
                })}
              </div>
            </article>

            {/* Estados de tickets (mini-funnel): muestra conteo por estado
             *  con barras horizontales proporcionales al máximo. Cubre el
             *  hueco del antiguo "Flujo de ticketing" (lista plana sin datos). */}
            <article className="ccmgc-card min-h-[220px] p-5">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
                  <Wrench size={14} strokeWidth={1.5} className="text-[var(--color-text-3)]" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--color-text-1)]">Estados de tickets</h3>
              </div>
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
