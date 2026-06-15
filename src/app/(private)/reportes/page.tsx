"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  Printer,
  RefreshCw,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { SectionTabs } from "@/components/ui/section-tabs";
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
    slaCompliancePercent: number | null;
    mttrMs: number | null;
  };
  series: Series[];
  byPriority: { priority: string; count: number }[];
  byOperator: { operator: string; count: number }[];
  mttrByOperator: { operator: string; mttrMs: number | null; resolved: number }[];
  byTipo: { tipo: string; count: number }[];
  topBuses: { busId: string; count: number; operator: string | null; municipio: string | null }[];
  topTechnicians: { userId: string; name: string; role: string; resolved: number }[];
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

export default function ReportesPage() {
  const [preset, setPreset] = useState<RangePreset>("last30");
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState<string>(todayIso());
  const [to, setTo] = useState<string>(todayIso());
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <SectionTabs preset="dashboard" />
      </div>
      <header className="reports-hero flex flex-col gap-4 p-5 print:border-0 print:bg-transparent print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] ring-1 ring-[var(--color-accent)]/25">
              <BarChart3 size={20} strokeWidth={1.7} className="text-[var(--color-accent)]" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="dashboard-pretitle">
                <span className="dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
                CCMGC · Análisis
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <h1 className="dashboard-hero-title text-[22px] font-semibold leading-tight tracking-tight sm:text-[24px]">
                  Reportes operativos
                </h1>
                <FeedbackTargetButton id="reportes/operativo" label="Reportes operativos" />
              </div>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
                Vista ejecutiva del centro de control. Periodo:{" "}
                <strong className="text-[var(--color-text-2)]">{data?.label ?? "—"}</strong>
                {data?.since && data?.until ? (
                  <span className="text-[var(--color-text-3)]">
                    {" "}
                    · {data.since.slice(0, 10)} → {data.until.slice(0, 10)} · {data.days} día
                    {data.days === 1 ? "" : "s"}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div
              role="tablist"
              aria-label="Periodo del reporte"
              className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-0.5 backdrop-blur"
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
                    "rounded-md px-3 py-1 text-[11.5px] font-semibold tracking-wide transition-all duration-150",
                    preset === p.id
                      ? "reports-period-pill--active"
                      : "text-[var(--color-text-2)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-1)]",
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
                  "ml-0.5 inline-flex items-center gap-1 rounded-md px-3 py-1 text-[11.5px] font-semibold tracking-wide transition-all duration-150",
                  preset === "custom"
                    ? "reports-period-pill--active"
                    : "text-[var(--color-text-2)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-1)]",
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
        </div>

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
      </header>

      {error ? (
        <p className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </p>
      ) : null}

      {loading || !data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-[var(--color-surface-2)]/60" />
          ))}
        </div>
      ) : (
        <>
          {/* Totales */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile
              label="Tickets creados"
              icon={<ClipboardList size={14} strokeWidth={1.8} aria-hidden />}
              value={String(data.totals.created)}
            />
            <Tile
              label="Tickets resueltos"
              icon={<TrendingUp size={14} strokeWidth={1.8} aria-hidden />}
              value={String(data.totals.resolved)}
              tone="success"
            />
            <Tile
              label="SLA cumplido"
              icon={<Target size={14} strokeWidth={1.8} aria-hidden />}
              value={data.totals.slaCompliancePercent == null ? "—" : `${data.totals.slaCompliancePercent}%`}
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
              label="MTTR medio"
              icon={<Clock3 size={14} strokeWidth={1.8} aria-hidden />}
              value={formatMs(data.totals.mttrMs)}
            />
          </section>

          {/* Serie temporal */}
          <section className="reports-panel">
            <h2 className="reports-panel-title">
              <span className="reports-panel-title-dot" aria-hidden />
              Tickets creados vs resueltos
            </h2>
            <SeriesChart series={data.series} />
          </section>

          {/* Distribuciones */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CardList
              title="Por operadora"
              rows={data.byOperator.map((r) => ({ label: r.operator, value: r.count }))}
            />
            <CardList
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
              title="Por tipo (top 10)"
              rows={data.byTipo.map((r) => ({ label: r.tipo, value: r.count }))}
            />
            <CardList
              title="MTTR por operadora"
              rows={data.mttrByOperator.map((r) => ({
                label: r.operator,
                value: r.mttrMs == null ? "—" : formatMs(r.mttrMs),
                hint: `${r.resolved} resueltos`,
              }))}
            />
          </section>

          {/* Top buses / Top técnicos */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="reports-panel">
              <h2 className="reports-panel-title">
                <FileText size={13} className="text-[var(--color-text-3)]" aria-hidden />
                Top 10 buses con más incidencia
              </h2>
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
            <div className="reports-panel">
              <h2 className="reports-panel-title">
                <Trophy size={13} className="text-[var(--color-warning)]" aria-hidden />
                Top técnicos por resoluciones
              </h2>
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
          </section>
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "error";
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
      className="reports-kpi-tile"
      style={toneVar ? { ["--kpi-tone" as string]: toneVar } : undefined}
    >
      <p className="reports-kpi-tile-head">
        {icon ? <span className="reports-kpi-tile-icon">{icon}</span> : null}
        {label}
      </p>
      <p
        className={cn(
          "reports-kpi-tile-value",
          !toneVar && "reports-kpi-tile-value--neutral",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CardList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string | number; hint?: string; tone?: "neutral" | "warning" | "error" }[];
}) {
  const max = Math.max(
    1,
    ...rows.map((r) => (typeof r.value === "number" ? r.value : 0)),
  );
  return (
    <div className="reports-panel">
      <h2 className="reports-panel-title">
        <span className="reports-panel-title-dot" aria-hidden />
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-3)]">Sin datos.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const pct = typeof r.value === "number" ? Math.round((r.value / max) * 100) : 100;
            const barToneVar =
              r.tone === "error"
                ? "var(--color-error)"
                : r.tone === "warning"
                  ? "var(--color-warning)"
                  : "var(--color-accent)";
            return (
              <li key={r.label} className="space-y-1.5">
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
                  <div className="reports-bar-track">
                    <div
                      className="reports-bar-fill"
                      style={{ width: `${pct}%`, ["--bar-tone" as string]: barToneVar }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SeriesChart({ series }: { series: Series[] }) {
  if (series.length === 0) {
    return <p className="text-sm text-[var(--color-text-3)]">Sin datos.</p>;
  }
  const width = 720;
  const height = 240;
  const padding = { top: 16, right: 12, bottom: 26, left: 36 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...series.map((s) => Math.max(s.creados, s.resueltos)));
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;

  // Genera tanto los puntos de la linea como un path cerrado para el
  // area pintada bajo la curva (con gradient SVG).
  const buildPaths = (key: "creados" | "resueltos") => {
    const pts = series.map((s, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + innerH - (s[key] / max) * innerH;
      return [x, y] as const;
    });
    const line = pts.map(([x, y]) => `${x},${y}`).join(" ");
    const first = pts[0];
    const last = pts[pts.length - 1];
    const baseline = padding.top + innerH;
    // Path cerrado: empieza en baseline, sube al primer punto, sigue la
    // linea, baja al baseline en el ultimo punto, vuelve al inicio.
    const area = `M ${first[0]},${baseline} L ${pts.map(([x, y]) => `${x},${y}`).join(" L ")} L ${last[0]},${baseline} Z`;
    return { line, area, pts };
  };

  const creados = buildPaths("creados");
  const resueltos = buildPaths("resueltos");

  // 5 lineas de cuadricula horizontal.
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((p) => {
    const y = padding.top + innerH - p * innerH;
    return { y, value: Math.round(max * p) };
  });

  // Etiquetas X: primer, mitad y ultimo.
  const xLabelIdxs =
    series.length <= 2
      ? series.map((_, i) => i)
      : [0, Math.floor(series.length / 2), series.length - 1];

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Gráfico de tickets creados vs resueltos"
        className="h-60 w-full min-w-[640px]"
      >
        <defs>
          {/* Gradients de area: del color hacia transparente. */}
          <linearGradient id="reports-area-creados" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.45" />
            <stop offset="60%" stopColor="var(--color-accent)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="reports-area-resueltos" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-success)" stopOpacity="0.42" />
            <stop offset="60%" stopColor="var(--color-success)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--color-success)" stopOpacity="0" />
          </linearGradient>
          {/* Glow para las polylines (sutil). */}
          <filter id="reports-line-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Cuadricula */}
        {gridLines.map((g) => (
          <g key={g.y}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={g.y}
              y2={g.y}
              stroke="currentColor"
              strokeOpacity="0.07"
              strokeDasharray="2,3"
            />
            <text
              x={padding.left - 8}
              y={g.y + 3}
              fontSize="9.5"
              textAnchor="end"
              fill="currentColor"
              opacity="0.55"
            >
              {g.value}
            </text>
          </g>
        ))}

        {/* Areas debajo de la linea */}
        <path d={creados.area} fill="url(#reports-area-creados)" />
        <path d={resueltos.area} fill="url(#reports-area-resueltos)" />

        {/* Lineas con glow */}
        <polyline
          points={creados.line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#reports-line-glow)"
        />
        <polyline
          points={resueltos.line}
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#reports-line-glow)"
        />

        {/* Dots solo en primer y ultimo punto + max de cada serie. */}
        {[creados, resueltos].map((s, i) => {
          if (s.pts.length === 0) return null;
          const colorVar = i === 0 ? "var(--color-accent)" : "var(--color-success)";
          const lastIdx = s.pts.length - 1;
          // Indice del maximo (si hay mas de 2 puntos).
          let maxIdx = -1;
          if (s.pts.length > 2) {
            const ys = s.pts.map(([, y]) => y);
            maxIdx = ys.indexOf(Math.min(...ys));
            if (maxIdx === 0 || maxIdx === lastIdx) maxIdx = -1;
          }
          const idxs = new Set<number>([0, lastIdx, ...(maxIdx >= 0 ? [maxIdx] : [])]);
          return Array.from(idxs).map((idx) => {
            const [x, y] = s.pts[idx];
            return (
              <g key={`${i}-${idx}`}>
                <circle cx={x} cy={y} r="4.5" fill={colorVar} opacity="0.25" />
                <circle cx={x} cy={y} r="2.6" fill={colorVar} stroke="var(--color-surface)" strokeWidth="1.5" />
              </g>
            );
          });
        })}

        {/* Etiquetas X */}
        {xLabelIdxs.map((idx) => {
          const x = padding.left + idx * stepX;
          return (
            <text
              key={idx}
              x={x}
              y={height - 8}
              fontSize="9.5"
              textAnchor="middle"
              fill="currentColor"
              opacity="0.55"
            >
              {series[idx].day.slice(5)}
            </text>
          );
        })}
      </svg>
      <div className="reports-chart-legend mt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="reports-chart-legend-dot" style={{ background: "var(--color-accent)", color: "var(--color-accent)" }} aria-hidden />
          Creados
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="reports-chart-legend-dot" style={{ background: "var(--color-success)", color: "var(--color-success)" }} aria-hidden />
          Resueltos
        </span>
      </div>
    </div>
  );
}
