"use client";

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPinned,
  Search,
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
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section-header";
import { knowledgeShortcuts } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type ActiveIncident = {
  id: string;
  busId: string;
  operator: string;
  assetType: string;
  status: "abierto" | "en_proceso" | "esperando_repuesto";
  priority: "alta" | "media" | "baja";
  slaDeadline: string;
  title: string;
};

type KpisData = {
  ticketsAbiertos: number;
  slaCompliancePercent: number | null;
  mttrMs: number | null;
  fleetAvailabilityPercent: number;
  resolvedCount30d: number;
  incidenciasActivas: ActiveIncident[];
  municipioStats: { name: string; count: number }[];
};

type TrendDay = { day: string; creados: number; resueltos: number };

type TrendSummary = {
  totalCreados: number;
  totalResueltos: number;
  promedioCreadosDia: number;
  peak: { day: string; creados: number } | null;
  topOperators: { busId: string; operator: string; creados: number }[];
};

const statusLabel: Record<string, string> = {
  abierto: "Abierto",
  en_proceso: "En Proceso",
  esperando_repuesto: "Esperando Repuesto",
  resuelto: "Resuelto",
};

const statusVariant = {
  abierto: "error",
  en_proceso: "warning",
  esperando_repuesto: "info",
  resuelto: "success",
} as const;

const flowSteps = ["Abierto", "En Proceso", "Esperando Repuesto", "Resuelto"];
const kpiIcons = [AlertCircle, Activity, Clock, CheckCircle2] as const;

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

function getMunicipalityDotClass(count: number) {
  if (count >= 6) return "bg-[var(--color-error)]";
  if (count >= 3) return "bg-[var(--color-warning)]";
  return "bg-[var(--color-success)]";
}

function KpiSkeleton() {
  return (
    <span className="inline-block h-6 w-16 animate-pulse rounded bg-[var(--color-surface-3)]" />
  );
}

export function Dashboard() {
  const searchParams = useSearchParams();
  const [kpis, setKpis] = useState<KpisData | null>(null);
  const [trend, setTrend] = useState<TrendDay[] | null>(null);
  const [trendSummary, setTrendSummary] = useState<TrendSummary | null>(null);
  const [trendDays, setTrendDays] = useState<7 | 14 | 30>(7);
  const [loading, setLoading] = useState(true);
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
    if (searchParams.get("vista") === "conductor") {
      setDashboardView("conductor");
    }
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      try {
        // TODO: añadir intervalo de refresco automático (cada 2-3 min).
        // De momento el usuario refresca manualmente; suficiente para el piloto.
        const [kpisRes, trendRes] = await Promise.all([
          fetch("/api/dashboard/kpis", { cache: "no-store" }),
          fetch(`/api/dashboard/trend?days=${trendDays}`, { cache: "no-store" }),
        ]);
        if (kpisRes.ok) setKpis((await kpisRes.json()) as KpisData);
        if (trendRes.ok) {
          const trendJson = (await trendRes.json()) as { trend: TrendDay[]; summary: TrendSummary };
          setTrend(trendJson.trend);
          setTrendSummary(trendJson.summary);
        }
      } catch {
        // silently degrade — page still renders with skeleton state
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [trendDays]);

  const kpiCards = [
    {
      label: "Tickets Abiertos",
      value: loading ? null : String(kpis?.ticketsAbiertos ?? "—"),
      trend: kpis ? `${kpis.resolvedCount30d} resueltos en 30 días` : "—",
      tone: (kpis?.ticketsAbiertos ?? 0) > 10 ? "critical" : "neutral",
    },
    {
      label: "Disponibilidad Flota",
      value: loading ? null : kpis ? `${kpis.fleetAvailabilityPercent}%` : "—",
      trend: "buses sin incidencia activa",
      tone: (kpis?.fleetAvailabilityPercent ?? 100) >= 90 ? "success" : "critical",
    },
    {
      label: "MTTR",
      value: loading ? null : formatMttr(kpis?.mttrMs ?? null),
      trend: "tiempo medio de resolución",
      tone: "neutral",
    },
    {
      label: "SLA Cumplido",
      value: loading ? null : kpis?.slaCompliancePercent !== null && kpis?.slaCompliancePercent !== undefined ? `${kpis.slaCompliancePercent}%` : "—",
      trend: "últimos 30 días",
      tone:
        kpis?.slaCompliancePercent !== null && kpis?.slaCompliancePercent !== undefined
          ? kpis.slaCompliancePercent >= 85
            ? "success"
            : "critical"
          : "neutral",
    },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeader
          title={dashboardView === "conductor" ? "Vista conductor" : "Panel operativo"}
          description={
            dashboardView === "conductor"
              ? "Resumen rápido para personal de campo"
              : "Control en tiempo real · Flota de Gran Canaria"
          }
        />
        <div className="flex shrink-0 gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5">
          <button
            type="button"
            onClick={() => syncUrlView("operaciones")}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              dashboardView === "operaciones"
                ? "bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-sm"
                : "text-[var(--color-text-3)] hover:text-[var(--color-text-2)]",
            )}
          >
            Operaciones
          </button>
          <button
            type="button"
            onClick={() => syncUrlView("conductor")}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              dashboardView === "conductor"
                ? "bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-sm"
                : "text-[var(--color-text-3)] hover:text-[var(--color-text-2)]",
            )}
          >
            Conductor
          </button>
        </div>
      </div>

      {dashboardView === "conductor" ? (
        <ConductorViewPanel />
      ) : (
      <section>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpiCards.map((kpi, idx) => {
            const Icon = kpiIcons[idx] ?? AlertCircle;
            return (
              <article
                key={kpi.label}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all duration-200 hover:border-[var(--color-border-hover)]"
              >
                <p className="flex items-center gap-1.5 text-label">
                  <Icon size={13} className="text-[var(--color-text-3)]" />
                  {kpi.label}
                </p>
                <div className="mt-2 tabular-nums text-3xl font-semibold text-[var(--color-text-1)]">
                  {kpi.value === null ? <KpiSkeleton /> : kpi.value}
                </div>
                <Badge variant={kpi.tone === "critical" ? "error" : kpi.tone === "success" ? "success" : "neutral"} className="mt-3">
                  {kpi.trend}
                </Badge>
              </article>
            );
          })}
        </div>

        <div className="mb-6 grid min-h-0 gap-4 lg:grid-cols-[1fr_340px] lg:items-stretch">
          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-subheading">Incidencias activas</h3>
              <Badge variant="error" className="inline-flex items-center gap-1.5">
                <AlertTriangle size={12} />
                Priorización SLA automática
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[660px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
                  <tr>
                    <th className="w-24 border-b border-[var(--color-border)] pb-3 font-medium">Ticket</th>
                    <th className="w-40 border-b border-[var(--color-border)] pb-3 font-medium">Bus / Operadora</th>
                    <th className="w-28 border-b border-[var(--color-border)] pb-3 font-medium">Equipo</th>
                    <th className="w-36 border-b border-[var(--color-border)] pb-3 font-medium">Estado</th>
                    <th className="w-28 border-b border-[var(--color-border)] pb-3 font-medium">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)]">
                        {Array.from({ length: 5 }).map((__, j) => (
                          <td key={j} className="py-3">
                            <div className="h-4 w-20 animate-pulse rounded bg-[var(--color-surface-3)]" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : kpis?.incidenciasActivas.length ? (
                    kpis.incidenciasActivas.map((ticket) => {
                      const slaMin = slaMinutesRemaining(ticket.slaDeadline);
                      return (
                        <tr
                          key={ticket.id}
                          className="cursor-pointer border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-2)] last:border-0"
                        >
                          <td className="w-24 py-3">
                            <Link
                              href={`/tickets/${ticket.id}`}
                              className="text-sm text-[var(--color-accent)] hover:underline"
                            >
                              {ticket.id.slice(0, 8)}…
                            </Link>
                          </td>
                          <td className="w-40 py-3">
                            <p className="text-sm font-medium text-[var(--color-text-1)]">{ticket.busId}</p>
                            <p className="text-xs text-[var(--color-text-3)]">{ticket.operator}</p>
                          </td>
                          <td className="w-28 py-3 text-sm capitalize text-[var(--color-text-1)]">
                            {ticket.assetType}
                          </td>
                          <td className="w-36 py-3">
                            <Badge variant={statusVariant[ticket.status] ?? "neutral"}>
                              {statusLabel[ticket.status] ?? ticket.status}
                            </Badge>
                          </td>
                          <td className="w-28 py-3 text-sm">
                            {slaMin <= 0 ? (
                              <Badge variant="error">Vencido</Badge>
                            ) : (
                              <span
                                className={cn(
                                  "tabular-nums",
                                  slaMin < 30
                                    ? "font-medium text-[var(--color-error)]"
                                    : slaMin < 120
                                      ? "text-[var(--color-warning)]"
                                      : "text-[var(--color-text-2)]",
                                )}
                              >
                                {slaMin} min
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-[var(--color-text-3)]">
                        No hay incidencias activas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="flex min-h-[220px] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:h-full lg:min-h-0">
            <div className="mb-2 shrink-0 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-subheading">Tendencia de tickets</h3>
                <p className="mt-1 text-caption">Últimos {trendDays} días · análisis operativo</p>
              </div>
              <div className="flex shrink-0 gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5">
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setTrendDays(d)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                      trendDays === d
                        ? "bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-sm"
                        : "text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            {trendSummary && !loading ? (
              <p className="mb-2 shrink-0 text-[11px] leading-snug text-[var(--color-text-2)]">
                {trendSummary.totalCreados} creados · {trendSummary.totalResueltos} resueltos · media{" "}
                {trendSummary.promedioCreadosDia} creados/día
                {trendSummary.peak && trendSummary.peak.creados > 0
                  ? ` · pico ${trendSummary.peak.creados} (${trendSummary.peak.day})`
                  : ""}
              </p>
            ) : null}
            {trendSummary?.topOperators?.length ? (
              <p className="mb-2 shrink-0 text-[11px] text-[var(--color-text-3)]">
                Top buses por tickets creados:{" "}
                {trendSummary.topOperators.map((o) => `${o.busId} (${o.creados})`).join(", ")}
              </p>
            ) : null}
            <div className="mt-2 flex min-h-0 flex-1 flex-col">
              <div className="relative w-full min-h-[200px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend ?? []} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: "var(--color-text-3)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fill: "var(--color-text-3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-surface-3)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "var(--color-text-1)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="creados"
                      name="Creados"
                      stroke="#DC2626"
                      fill="#DC2626"
                      fillOpacity={0.12}
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="resueltos"
                      name="Resueltos"
                      stroke="#059669"
                      fill="#059669"
                      fillOpacity={0.1}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 shrink-0 flex gap-4 text-[11px] text-[var(--color-text-3)]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
                  Creados
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#059669]" />
                  Resueltos
                </span>
              </div>
            </div>
          </article>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/mapa"
            className="group block min-h-[200px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all duration-200 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-2)]/30"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPinned size={16} className="text-[var(--color-text-3)] group-hover:text-[var(--color-accent)]" />
                <h3 className="text-subheading">Mapa de incidencias</h3>
              </div>
              <ChevronRight size={16} className="shrink-0 text-[var(--color-text-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]" />
            </div>
            <ul className="mt-4 space-y-2">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <div className="h-3 w-32 animate-pulse rounded bg-[var(--color-surface-3)]" />
                    </li>
                  ))
                : (kpis?.municipioStats ?? []).map((item) => (
                    <li key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", getMunicipalityDotClass(item.count))} />
                        <span className="text-[var(--color-text-1)]">{item.name}</span>
                      </div>
                      <span className="text-caption">{item.count} inc.</span>
                    </li>
                  ))}
              {!loading && !kpis?.municipioStats.length && (
                <li className="text-sm text-[var(--color-text-3)]">Sin incidencias activas</li>
              )}
            </ul>
            <p className="mt-3 text-xs font-medium text-[var(--color-accent)]">Abrir mapa operativo</p>
          </Link>

          <DashboardPreventiveAgenda />

          <article className="min-h-[200px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-[var(--color-text-3)]" />
              <h3 className="text-subheading">Base de conocimiento</h3>
            </div>
            <div className="mt-4 space-y-2">
              {knowledgeShortcuts.map((entry) => (
                <button
                  key={entry}
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left text-sm text-[var(--color-text-2)] transition-all duration-150 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
                >
                  <span>{entry}</span>
                  <ChevronRight size={14} className="shrink-0 text-[var(--color-text-3)]" />
                </button>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="flex items-center gap-2">
              <Wrench size={16} className="text-[var(--color-text-3)]" />
              <h3 className="text-subheading">Flujo de ticketing</h3>
            </div>
            <div className="mt-4">
              {flowSteps.map((step, index) => (
                <div key={step}>
                  <div className="flex items-center gap-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[11px] font-medium text-[var(--color-accent)]">
                      {index + 1}
                    </span>
                    <span className="text-sm text-[var(--color-text-2)]">{step}</span>
                  </div>
                  {index < flowSteps.length - 1 ? <div className="ml-3 h-3 w-px bg-[var(--color-border)]" /> : null}
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
