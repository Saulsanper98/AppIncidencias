"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  Info,
  Printer,
  RefreshCw,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { SeriesChart } from "@/components/reports/reports-series-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { HeroShell } from "@/components/ui/hero-shell";
import { ProgressBar } from "@/components/ui/progress-bar";
import { DesviosReportPanel } from "@/components/reports/DesviosReportPanel";
import { SectionTabs } from "@/components/ui/section-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Página de reportes analíticos.
 *
 * Pinta múltiples cards con gráficos minimal (SVG inline, sin librería
 * externa). Permite elegir periodo (presets rápidos, día único o rango
 * personalizado) y exportar tanto a XLSX (endpoint server) como a PDF
 * (window.print con un CSS de impresión básico).
 */

type Series = { day: string; creados: number; resueltos: number };
type ReportPayload = {
  days: number;
  preset?: string;
  label?: string;
  since: string;
  until?: string;
  totals: {
    created: number;
    resolved: number;
    uniqueTicketsResolved?: number;
    slaCompliancePercent: number | null;
    mttrMs: number | null;
  };
  metricsMeta?: {
    definitions: Record<string, string>;
    dataQuality: {
      resolutionEvents: number;
      uniqueTicketsResolved: number;
      technicianAttributed: number;
      legacyUpdatedAtCount: number;
      gapLegacyVsEvents: number;
      ticketsWithoutHistory: number;
    };
    previousPeriod?: {
      since: string;
      until: string;
      label: string;
      totals: {
        created: number;
        resolved: number;
        slaCompliancePercent: number | null;
        mttrMs: number | null;
      };
    };
  };
  series: Series[];
  byPriority: { priority: string; count: number }[];
  byOperator: { operator: string; count: number }[];
  mttrByOperator: { operator: string; mttrMs: number | null; resolved: number }[];
  byTipo: { tipo: string; count: number }[];
  topBuses: { busId: string; count: number; operator: string | null; municipio: string | null }[];
  topTechnicians: { userId: string; name: string; role: string; resolved: number }[];
  topConductors: { conductorId: string; name: string; operator: string | null; count: number }[];
};

type RangePreset = "today" | "yesterday" | "last7" | "last30" | "last90" | "last180" | "custom";

const PRESET_BUTTONS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "last7", label: "7d" },
  { id: "last30", label: "30d" },
  { id: "last90", label: "90d" },
  { id: "last180", label: "180d" },
];

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem.toString().padStart(2, "0")}m`;
}

function reportStaggerClass(index: number) {
  return `ccmgc-stagger-in ccmgc-stagger-in-${(index % 6) + 1}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Devuelve la clase CSS de medalla (oro / plata / bronce) para el podio
 * de las primeras 3 posiciones en Top buses / Top tecnicos. Del 4 en
 * adelante usa la pill neutra base.
 */
function podiumClass(idx: number): string {
  if (idx === 0) return "reports-podium-rank--gold";
  if (idx === 1) return "reports-podium-rank--silver";
  if (idx === 2) return "reports-podium-rank--bronze";
  return "";
}

type DeltaTone = "success" | "warning" | "error" | "neutral";

function formatDeltaLabel(current: number | null, previous: number | null, suffix = ""): string | null {
  if (current == null || previous == null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "Sin cambio";
  return `${pct > 0 ? "+" : ""}${pct}% ${suffix}`.trim();
}

function qualitySemaforo(
  quality: NonNullable<ReportPayload["metricsMeta"]>["dataQuality"],
): {
  estado: "verde" | "ambar" | "rojo";
  titulo: string;
  detalle: string;
} {
  const hasGap = Math.abs(quality.gapLegacyVsEvents) > 0;
  const hasLegacy = quality.ticketsWithoutHistory > 0;
  if (!hasGap && !hasLegacy) {
    return {
      estado: "verde",
      titulo: "Calidad de datos estable",
      detalle: "La trazabilidad de cierres es consistente en este periodo.",
    };
  }
  if (hasGap && hasLegacy) {
    return {
      estado: "rojo",
      titulo: "Revisión recomendada",
      detalle: "Hay diferencias entre cierres y datos legacy; valida decisiones críticas.",
    };
  }
  return {
    estado: "ambar",
    titulo: "Atención moderada",
    detalle: "Se detectan pequeñas brechas de calidad sin impacto estructural alto.",
  };
}

export default function ReportesPage() {
  const [preset, setPreset] = useState<RangePreset>("last30");
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState<string>(todayIso());
  const [to, setTo] = useState<string>(todayIso());
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricsOpen, setMetricsOpen] = useState(false);

  // Query string para el endpoint y para el botón de Excel.
  const reportQuery = useMemo(() => {
    if (preset === "custom") {
      const params = new URLSearchParams();
      params.set("from", from);
      if (to && to !== from) params.set("to", to);
      return params.toString();
    }
    return `range=${preset}`;
  }, [preset, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/operational?${reportQuery}`, { cache: "no-store" });
      if (!res.ok) {
        setError("No se pudo cargar el reporte.");
        return;
      }
      setData((await res.json()) as ReportPayload);
    } catch {
      setError("No se pudo cargar el reporte.");
    } finally {
      setLoading(false);
    }
  }, [reportQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePickSingleDay = useCallback((iso: string) => {
    setFrom(iso);
    setTo(iso);
    setPreset("custom");
    setCustomOpen(true);
  }, []);

  const comparisonBadges = useMemo(() => {
    const previous = data?.metricsMeta?.previousPeriod?.totals;
    if (!data || !previous) return null;
    return {
      created: {
        label: formatDeltaLabel(data.totals.created, previous.created, "vs ant."),
        tone: (data.totals.created >= previous.created ? "warning" : "success") as DeltaTone,
      },
      resolved: {
        label: formatDeltaLabel(data.totals.resolved, previous.resolved, "vs ant."),
        tone: (data.totals.resolved >= previous.resolved ? "success" : "warning") as DeltaTone,
      },
      sla: {
        label: formatDeltaLabel(data.totals.slaCompliancePercent, previous.slaCompliancePercent, "vs ant."),
        tone: ((data.totals.slaCompliancePercent ?? 0) >= (previous.slaCompliancePercent ?? 0)
          ? "success"
          : "error") as DeltaTone,
      },
      mttr: {
        label: formatDeltaLabel(
          previous.mttrMs == null ? null : Number(previous.mttrMs),
          data.totals.mttrMs == null ? null : Number(data.totals.mttrMs),
          "vs ant.",
        ),
        tone: ((data.totals.mttrMs ?? Number.MAX_SAFE_INTEGER) <= (previous.mttrMs ?? Number.MAX_SAFE_INTEGER)
          ? "success"
          : "warning") as DeltaTone,
      },
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <SectionTabs preset="dashboard" />
      </div>
      <HeroShell
        variant="reports-hero"
        dotColor="var(--color-accent)"
        className="print:border-0 print:bg-transparent print:p-0"
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <BarChart3 size={12} strokeWidth={1.8} aria-hidden />
            CCMGC · Análisis
          </span>
        }
        title={
          <span className="inline-flex flex-wrap items-baseline gap-2">
            Reportes operativos
            <FeedbackTargetButton id="reportes/operativo" label="Reportes operativos" />
          </span>
        }
        subtitle={
          <>
            Vista ejecutiva del centro de control. Periodo:{" "}
            <strong className="text-[var(--color-text-2)]">{data?.label ?? "—"}</strong>
            {data?.since && data?.until ? (
              <span className="text-[var(--color-text-3)]">
                {" "}
                · {data.since.slice(0, 10)} → {data.until.slice(0, 10)} · {data.days} día
                {data.days === 1 ? "" : "s"}
              </span>
            ) : null}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div
              role="tablist"
              aria-label="Periodo del reporte"
              className="inline-flex flex-wrap items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-1 shadow-sm backdrop-blur"
            >
              {PRESET_BUTTONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPreset(p.id);
                    setCustomOpen(false);
                  }}
                  aria-pressed={preset === p.id}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all",
                    preset === p.id
                      ? "bg-gradient-to-br from-[var(--color-accent)] to-violet-600 text-white shadow"
                      : "text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
                  )}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPreset("custom");
                  setCustomOpen((v) => !v || preset !== "custom");
                }}
                aria-pressed={preset === "custom"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all",
                  preset === "custom"
                    ? "bg-gradient-to-br from-[var(--color-accent)] to-violet-600 text-white shadow"
                    : "text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
                )}
                title="Elegir día o rango personalizado"
              >
                <CalendarRange size={13} aria-hidden />
                Otra fecha…
              </button>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="reports-action-chip disabled:opacity-50"
              title="Recargar datos"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden />
              Recargar
            </button>
            <a
              href={`/api/reports/operational/export?${reportQuery}`}
              className="reports-action-chip"
              title="Descargar como Excel (.xlsx)"
            >
              <Download size={13} aria-hidden />
              Excel
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="reports-action-chip"
              title="Imprimir o exportar a PDF (usa el diálogo del navegador)"
            >
              <Printer size={13} aria-hidden />
              PDF
            </button>
          </div>
        }
      />

      {customOpen ? (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-3 backdrop-blur print:hidden">
            <div className="flex flex-col">
              <label className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                Desde
              </label>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => {
                  const v = e.target.value || todayIso();
                  setFrom(v);
                  if (to && v > to) setTo(v);
                  setPreset("custom");
                }}
                className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-1)]"
              />
            </div>
            <div className="flex flex-col">
              <label className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                Hasta
              </label>
              <input
                type="date"
                value={to}
                min={from || undefined}
                max={todayIso()}
                onChange={(e) => {
                  setTo(e.target.value || from);
                  setPreset("custom");
                }}
                className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text-1)]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handlePickSingleDay(todayIso())}
                className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[11px] text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)]"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setUTCDate(d.getUTCDate() - 1);
                  handlePickSingleDay(d.toISOString().slice(0, 10));
                }}
                className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[11px] text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)]"
              >
                Ayer
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!from) return;
                  setTo(from);
                  setPreset("custom");
                }}
                className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[11px] text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)]"
                title="Acota el rango a un único día (el de Desde)"
              >
                Solo este día
              </button>
            </div>
          </div>
        ) : null}

      {error ? (
        <p className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </p>
      ) : null}

      {loading || !data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Totales */}
          {data.metricsMeta ? (
            <ExecutiveSemaphore
              className={reportStaggerClass(1)}
              quality={data.metricsMeta.dataQuality}
            />
          ) : null}

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile
              className={reportStaggerClass(2)}
              label="Tickets creados"
              icon={<ClipboardList size={14} strokeWidth={1.8} aria-hidden />}
              value={String(data.totals.created)}
              hint="Altas en el periodo"
              title={data.metricsMeta?.definitions.created}
              badge={comparisonBadges?.created.label ? { label: comparisonBadges.created.label, tone: comparisonBadges.created.tone } : undefined}
            />
            <Tile
              className={reportStaggerClass(3)}
              label="Tickets resueltos"
              icon={<TrendingUp size={14} strokeWidth={1.8} aria-hidden />}
              value={String(data.totals.resolved)}
              hint={
                data.totals.uniqueTicketsResolved != null &&
                data.totals.uniqueTicketsResolved !== data.totals.resolved
                  ? `${data.totals.uniqueTicketsResolved} tickets únicos`
                  : "Acciones de cierre"
              }
              title={data.metricsMeta?.definitions.resolved}
              tone="success"
              badge={comparisonBadges?.resolved.label ? { label: comparisonBadges.resolved.label, tone: comparisonBadges.resolved.tone } : undefined}
            />
            <Tile
              className={reportStaggerClass(4)}
              label="SLA cumplido"
              icon={<Target size={14} strokeWidth={1.8} aria-hidden />}
              value={data.totals.slaCompliancePercent == null ? "—" : `${data.totals.slaCompliancePercent}%`}
              hint="Sobre cierres del periodo"
              title={data.metricsMeta?.definitions.slaCompliance}
              badge={comparisonBadges?.sla.label ? { label: comparisonBadges.sla.label, tone: comparisonBadges.sla.tone } : undefined}
              tone={
                data.totals.slaCompliancePercent == null
                  ? "neutral"
                  : data.totals.slaCompliancePercent >= 90
                    ? "success"
                    : data.totals.slaCompliancePercent >= 75
                      ? "warning"
                      : "error"
              }
            />
            <Tile
              className={reportStaggerClass(5)}
              label="MTTR medio"
              icon={<Clock3 size={14} strokeWidth={1.8} aria-hidden />}
              value={formatMs(data.totals.mttrMs)}
              hint="Creación → cierre"
              title={data.metricsMeta?.definitions.mttr}
              badge={comparisonBadges?.mttr.label ? { label: comparisonBadges.mttr.label, tone: comparisonBadges.mttr.tone } : undefined}
            />
          </section>

          {data.metricsMeta ? (
            <MetricsGlossary
              open={metricsOpen}
              onToggle={() => setMetricsOpen((v) => !v)}
              definitions={data.metricsMeta.definitions}
              dataQuality={data.metricsMeta.dataQuality}
              className={reportStaggerClass(4)}
            />
          ) : null}

          {/* Serie temporal */}
          <section className={cn("reports-panel", reportStaggerClass(5))}>
            <h2 className="reports-panel-title">
              <span className="reports-panel-title-dot" aria-hidden />
              Tickets creados vs resueltos
            </h2>
            <p className="mb-3 text-[11px] text-[var(--color-text-3)]">
              Creados = altas diarias · Resueltos = acciones de cierre (
              {data.metricsMeta?.definitions.seriesResolved ?? "TicketStatusChange"})
            </p>
            <SeriesChart series={data.series} />
          </section>

          {/* Distribuciones */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CardList
              className={reportStaggerClass(6)}
              title="Por operadora"
              rows={data.byOperator.map((r) => ({ label: r.operator, value: r.count }))}
            />
            <CardList
              className={reportStaggerClass(7)}
              title="Por prioridad"
              rows={data.byPriority.map((r) => ({
                label: r.priority,
                value: r.count,
                tone:
                  r.priority === "alta"
                    ? "error"
                    : r.priority === "media"
                      ? "warning"
                      : "neutral",
              }))}
            />
            <CardList
              className={reportStaggerClass(8)}
              title="Por tipo (top 10)"
              rows={data.byTipo.map((r) => ({ label: r.tipo, value: r.count }))}
            />
            <CardList
              className={reportStaggerClass(9)}
              title="MTTR por operadora"
              rows={data.mttrByOperator.map((r) => ({
                label: r.operator,
                value: r.mttrMs == null ? "—" : formatMs(r.mttrMs),
                hint: `${r.resolved} resueltos`,
              }))}
            />
          </section>

          {/* Top buses / Top técnicos / Top conductores */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className={cn("reports-panel", reportStaggerClass(10))}>
              <h2 className="reports-panel-title">
                <FileText size={13} className="text-[var(--color-text-3)]" aria-hidden />
                Top 10 buses con más incidencia
              </h2>
              <p className="mb-2 text-[11px] text-[var(--color-text-3)]">
                {data.metricsMeta?.definitions.topBuses ?? "Tickets creados por bus en el periodo."}
              </p>
              {data.topBuses.length === 0 ? (
                <p className="text-sm text-[var(--color-text-3)]">Sin datos suficientes.</p>
              ) : (
                <ol className="space-y-0.5">
                  {data.topBuses.map((b, idx) => (
                    <li key={b.busId} className="reports-podium-row text-sm">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={cn("reports-podium-rank", podiumClass(idx))}>{idx + 1}</span>
                        <a
                          href={`/bandeja?busId=${encodeURIComponent(b.busId)}`}
                          className="truncate font-mono text-[13px] font-medium text-[var(--color-text-1)] hover:text-[var(--color-accent)] hover:underline"
                          title={[b.operator, b.municipio].filter(Boolean).join(" · ")}
                        >
                          {b.busId}
                        </a>
                      </span>
                      <span className="reports-podium-count-pill">{b.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className={cn("reports-panel", reportStaggerClass(11))}>
              <h2 className="reports-panel-title">
                <Trophy size={13} className="text-[var(--color-warning)]" aria-hidden />
                Top técnicos por resoluciones
              </h2>
              <p className="mb-2 text-[11px] text-[var(--color-text-3)]">
                {data.metricsMeta?.definitions.topTechnicians ??
                  "Cierres del técnico en el periodo seleccionado."}{" "}
                <span className="text-[var(--color-text-2)]">({data.label})</span>
              </p>
              {data.topTechnicians.length === 0 ? (
                <p className="text-sm text-[var(--color-text-3)]">Sin datos suficientes.</p>
              ) : (
                <ol className="space-y-0.5">
                  {data.topTechnicians.map((t, idx) => (
                    <li key={t.userId} className="reports-podium-row text-sm">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={cn("reports-podium-rank", podiumClass(idx))}>{idx + 1}</span>
                        <span className="truncate text-[13px] font-medium text-[var(--color-text-1)]">{t.name}</span>
                      </span>
                      <span className="reports-podium-count-pill">{t.resolved}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className={cn("reports-panel", reportStaggerClass(12))}>
              <h2 className="reports-panel-title">
                <ClipboardList size={13} className="text-[var(--color-accent)]" aria-hidden />
                Top conductores (origen conductor)
              </h2>
              <p className="mb-2 text-[11px] text-[var(--color-text-3)]">
                {data.metricsMeta?.definitions.topConductors ??
                  "Tickets con origen del fallo = conductor."}
              </p>
              {(data.topConductors ?? []).length === 0 ? (
                <p className="text-sm text-[var(--color-text-3)]">
                  Sin datos. Marca «Origen del fallo: Conductor» al crear tickets.
                </p>
              ) : (
                <ol className="space-y-0.5">
                  {(data.topConductors ?? []).map((c, idx) => (
                    <li key={c.conductorId} className="reports-podium-row text-sm">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={cn("reports-podium-rank", podiumClass(idx))}>{idx + 1}</span>
                        <a
                          href={`/bandeja?conductor=${encodeURIComponent(c.name)}`}
                          className="truncate text-[13px] font-medium text-[var(--color-text-1)] hover:text-[var(--color-accent)] hover:underline"
                          title={c.operator ?? undefined}
                        >
                          {c.name}
                        </a>
                      </span>
                      <span className="reports-podium-count-pill">{c.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </>
      )}

      <DesviosReportPanel />
    </div>
  );
}

function Tile({
  label,
  value,
  icon,
  hint,
  title,
  tone = "neutral",
  badge,
  className,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  hint?: string;
  title?: string;
  tone?: "neutral" | "success" | "warning" | "error";
  badge?: { label: string; tone: DeltaTone };
  className?: string;
}) {
  // Tinte CSS por tono. "neutral" no tinta para no ensuciar la vista.
  const toneVar = {
    neutral: undefined,
    success: "var(--color-success)",
    warning: "var(--color-warning)",
    error: "var(--color-error)",
  }[tone];
  return (
    <div
      className={cn("reports-kpi-tile", className)}
      style={toneVar ? { ["--kpi-tone" as string]: toneVar } : undefined}
      title={title}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="reports-kpi-tile-head">
          {icon ? <span className="reports-kpi-tile-icon">{icon}</span> : null}
          {label}
        </p>
        {badge ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              badge.tone === "success" && "bg-[var(--color-success-light)] text-[var(--color-success)]",
              badge.tone === "warning" && "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
              badge.tone === "error" && "bg-[var(--color-error-light)] text-[var(--color-error)]",
              badge.tone === "neutral" && "bg-[var(--color-surface-2)] text-[var(--color-text-2)]",
            )}
          >
            {badge.label}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "reports-kpi-tile-value",
          !toneVar && "reports-kpi-tile-value--neutral",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[10px] text-[var(--color-text-3)]">{hint}</p> : null}
    </div>
  );
}

function ExecutiveSemaphore({
  quality,
  className,
}: {
  quality: NonNullable<ReportPayload["metricsMeta"]>["dataQuality"];
  className?: string;
}) {
  const state = qualitySemaforo(quality);
  const dotClass =
    state.estado === "verde"
      ? "bg-[var(--color-success)]"
      : state.estado === "ambar"
        ? "bg-[var(--color-warning)]"
        : "bg-[var(--color-error)]";
  const panelClass =
    state.estado === "verde"
      ? "border-[var(--color-success)]/30 bg-[var(--color-success-light)]/30"
      : state.estado === "ambar"
        ? "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)]/30"
        : "border-[var(--color-error)]/30 bg-[var(--color-error-light)]/30";

  return (
    <section className={cn("reports-panel", panelClass, className)} role="status" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            Semáforo de calidad
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-text-1)]">{state.titulo}</p>
          <p className="mt-1 text-[12px] text-[var(--color-text-2)]">{state.detalle}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)]/70 bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-2)]">
          <span className={cn("h-2.5 w-2.5 rounded-full", dotClass)} aria-hidden />
          {state.estado.toUpperCase()}
        </div>
      </div>
    </section>
  );
}

const METRICS_GLOSSARY_ROWS: { key: string; label: string }[] = [
  { key: "created", label: "Tickets creados" },
  { key: "resolved", label: "Tickets resueltos" },
  { key: "uniqueTicketsResolved", label: "Tickets únicos cerrados" },
  { key: "slaCompliance", label: "SLA cumplido" },
  { key: "mttr", label: "MTTR medio" },
  { key: "seriesResolved", label: "Curva «Resueltos»" },
  { key: "topTechnicians", label: "Top técnicos" },
  { key: "topBuses", label: "Top buses" },
  { key: "legacyUpdatedAt", label: "Método antiguo (updatedAt)" },
];

function MetricsGlossary({
  open,
  onToggle,
  definitions,
  dataQuality,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  definitions: Record<string, string>;
  dataQuality: NonNullable<ReportPayload["metricsMeta"]>["dataQuality"];
  className?: string;
}) {
  return (
    <section className={cn("reports-panel print:hidden", className)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text-1)]">
          <Info size={14} className="text-[var(--color-accent)]" aria-hidden />
          Cómo se calculan estas métricas
        </span>
        {open ? (
          <ChevronUp size={16} className="text-[var(--color-text-3)]" aria-hidden />
        ) : (
          <ChevronDown size={16} className="text-[var(--color-text-3)]" aria-hidden />
        )}
      </button>
      {open ? (
        <div className="mt-3 space-y-4 border-t border-[var(--color-border)] pt-3">
          <dl className="grid gap-2 sm:grid-cols-2">
            {METRICS_GLOSSARY_ROWS.map((row) => (
              <div key={row.key} className="rounded-lg border border-[var(--color-border)]/70 bg-[var(--color-surface-2)]/40 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-2)]">
                  {row.label}
                </dt>
                <dd className="mt-1 text-[11.5px] leading-snug text-[var(--color-text-3)]">
                  {definitions[row.key] ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-2)]">
              Calidad de datos en este periodo
            </p>
            <ul className="mt-2 grid gap-1 text-[11.5px] text-[var(--color-text-3)] sm:grid-cols-2">
              <li>Cierres registrados: <strong className="text-[var(--color-text-1)]">{dataQuality.resolutionEvents}</strong></li>
              <li>Tickets únicos cerrados: <strong className="text-[var(--color-text-1)]">{dataQuality.uniqueTicketsResolved}</strong></li>
              <li>Atribuidos a técnico: <strong className="text-[var(--color-text-1)]">{dataQuality.technicianAttributed}</strong></li>
              <li>Método antiguo (updatedAt): <strong className="text-[var(--color-text-1)]">{dataQuality.legacyUpdatedAtCount}</strong></li>
              <li>Diferencia legacy vs real: <strong className="text-[var(--color-text-1)]">{dataQuality.gapLegacyVsEvents >= 0 ? "+" : ""}{dataQuality.gapLegacyVsEvents}</strong></li>
              <li>Sin historial estructurado: <strong className="text-[var(--color-text-1)]">{dataQuality.ticketsWithoutHistory}</strong></li>
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CardList({
  title,
  rows,
  className,
}: {
  title: string;
  rows: { label: string; value: string | number; hint?: string; tone?: "neutral" | "warning" | "error" }[];
  className?: string;
}) {
  const max = Math.max(
    1,
    ...rows.map((r) => (typeof r.value === "number" ? r.value : 0)),
  );
  return (
    <div className={cn("reports-panel", className)}>
      <h2 className="reports-panel-title">
        <span className="reports-panel-title-dot" aria-hidden />
        {title}
      </h2>
      {rows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Sin datos"
          hint="No hay registros para este periodo."
          compact
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r, index) => {
            const pct = typeof r.value === "number" ? Math.round((r.value / max) * 100) : 100;
            return (
              <li key={r.label} className={cn("space-y-1.5", reportStaggerClass(index))}>
                <div className="flex items-center justify-between text-sm">
                  <span className="min-w-0 truncate font-medium text-[var(--color-text-2)]">{r.label}</span>
                  <span className="ml-2 shrink-0 font-bold tabular-nums text-[var(--color-text-1)]">
                    {r.value}
                    {r.hint ? (
                      <span className="ml-1.5 text-[10px] font-normal text-[var(--color-text-3)]">
                        {r.hint}
                      </span>
                    ) : null}
                  </span>
                </div>
                {typeof r.value === "number" ? (
                  <ProgressBar
                    value={pct}
                    tone={
                      r.tone === "error"
                        ? "error"
                        : r.tone === "warning"
                          ? "warning"
                          : "accent"
                    }
                    trackClassName="reports-bar-track"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
