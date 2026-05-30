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
      <header className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-4 print:border-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={20} className="text-[var(--color-accent)]" aria-hidden />
            <h1 className="text-heading">Reportes operativos</h1>
            <FeedbackTargetButton id="reportes/operativo" label="Reportes operativos" />
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div
              role="tablist"
              aria-label="Periodo del reporte"
              className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
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
                    "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                    preset === p.id
                      ? "bg-[var(--color-accent)] text-white shadow"
                      : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
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
                  "ml-0.5 inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                  preset === "custom"
                    ? "bg-[var(--color-accent)] text-white shadow"
                    : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                )}
                title="Elegir día o rango personalizado"
              >
                <CalendarRange size={12} aria-hidden />
                Otra fecha…
              </button>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 text-xs font-medium text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-50"
              title="Recargar datos"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} aria-hidden />
              Recargar
            </button>
            <a
              href={`/api/reports/operational/export?${reportQuery}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 text-xs font-medium text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)]"
              title="Descargar como Excel (.xlsx)"
            >
              <Download size={12} aria-hidden />
              Excel
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 text-xs font-medium text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)]"
              title="Imprimir o exportar a PDF (usa el diálogo del navegador)"
            >
              <Printer size={12} aria-hidden />
              PDF
            </button>
          </div>
        </div>

        {customOpen ? (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 print:hidden">
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
                className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-xs text-[var(--color-text-1)]"
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
                className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-xs text-[var(--color-text-1)]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handlePickSingleDay(todayIso())}
                className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-[11px] text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)]"
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
                className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-[11px] text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)]"
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
                className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-[11px] text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)]"
                title="Acota el rango a un único día (el de Desde)"
              >
                Solo este día
              </button>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-[var(--color-text-3)]">
          Periodo: <strong>{data?.label ?? "—"}</strong>{" "}
          {data?.since && data?.until ? (
            <span className="text-[var(--color-text-3)]">
              ({data.since.slice(0, 10)} → {data.until.slice(0, 10)} · {data.days} día
              {data.days === 1 ? "" : "s"})
            </span>
          ) : null}
        </p>
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
              icon={<ClipboardList size={14} aria-hidden />}
              value={String(data.totals.created)}
            />
            <Tile
              label="Tickets resueltos"
              icon={<TrendingUp size={14} aria-hidden />}
              value={String(data.totals.resolved)}
            />
            <Tile
              label="SLA cumplido"
              icon={<Target size={14} aria-hidden />}
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
              icon={<Clock3 size={14} aria-hidden />}
              value={formatMs(data.totals.mttrMs)}
            />
          </section>

          {/* Serie temporal */}
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-1)]">
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
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-1)]">
                <FileText size={14} className="text-[var(--color-text-3)]" aria-hidden />
                Top 10 buses con más incidencia
              </h2>
              {data.topBuses.length === 0 ? (
                <p className="text-sm text-[var(--color-text-3)]">Sin datos suficientes.</p>
              ) : (
                <ol className="space-y-1.5">
                  {data.topBuses.map((b, idx) => (
                    <li key={b.busId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[10px] font-semibold text-[var(--color-text-3)]">
                          {idx + 1}
                        </span>
                        <a
                          href={`/tickets?busId=${encodeURIComponent(b.busId)}`}
                          className="truncate font-mono text-[13px] text-[var(--color-text-1)] hover:underline"
                          title={[b.operator, b.municipio].filter(Boolean).join(" · ")}
                        >
                          {b.busId}
                        </a>
                      </span>
                      <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-text-2)]">
                        {b.count}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-1)]">
                <Trophy size={14} className="text-[var(--color-text-3)]" aria-hidden />
                Top técnicos por resoluciones
              </h2>
              {data.topTechnicians.length === 0 ? (
                <p className="text-sm text-[var(--color-text-3)]">Sin datos suficientes.</p>
              ) : (
                <ol className="space-y-1.5">
                  {data.topTechnicians.map((t, idx) => (
                    <li key={t.userId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[10px] font-semibold text-[var(--color-text-3)]">
                          {idx + 1}
                        </span>
                        <span className="truncate text-[13px] text-[var(--color-text-1)]">{t.name}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-text-2)]">
                        {t.resolved}
                      </span>
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
  const toneClass = {
    neutral: "text-[var(--color-text-1)]",
    success: "text-[var(--color-success)]",
    warning: "text-[var(--color-warning)]",
    error: "text-[var(--color-error)]",
  }[tone];
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
        {icon}
        {label}
      </p>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums", toneClass)}>{value}</p>
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
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-1)]">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-3)]">Sin datos.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const pct = typeof r.value === "number" ? Math.round((r.value / max) * 100) : 100;
            const barColor =
              r.tone === "error"
                ? "bg-[var(--color-error)]"
                : r.tone === "warning"
                  ? "bg-[var(--color-warning)]"
                  : "bg-[var(--color-accent)]";
            return (
              <li key={r.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="min-w-0 truncate text-[var(--color-text-2)]">{r.label}</span>
                  <span className="ml-2 shrink-0 font-semibold tabular-nums text-[var(--color-text-1)]">
                    {r.value}
                    {r.hint ? (
                      <span className="ml-1 text-[10px] font-normal text-[var(--color-text-3)]">
                        {r.hint}
                      </span>
                    ) : null}
                  </span>
                </div>
                {typeof r.value === "number" ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                    <div
                      className={cn("h-full rounded-full transition-all duration-700", barColor)}
                      style={{ width: `${pct}%` }}
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
  const height = 220;
  const padding = { top: 12, right: 8, bottom: 22, left: 32 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...series.map((s) => Math.max(s.creados, s.resueltos)));
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;

  const pointsCreados = series
    .map((s, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + innerH - (s.creados / max) * innerH;
      return `${x},${y}`;
    })
    .join(" ");
  const pointsResueltos = series
    .map((s, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + innerH - (s.resueltos / max) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  // 5 líneas de cuadrícula horizontal.
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((p) => {
    const y = padding.top + innerH - p * innerH;
    return { y, value: Math.round(max * p) };
  });

  // Etiquetas X: primer, mitad y último.
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
        className="h-56 w-full min-w-[640px]"
      >
        {/* Cuadrícula */}
        {gridLines.map((g) => (
          <g key={g.y}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={g.y}
              y2={g.y}
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeDasharray="2,3"
            />
            <text
              x={padding.left - 6}
              y={g.y + 3}
              fontSize="9"
              textAnchor="end"
              fill="currentColor"
              opacity="0.6"
            >
              {g.value}
            </text>
          </g>
        ))}

        {/* Líneas */}
        <polyline
          points={pointsCreados}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={pointsResueltos}
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Etiquetas X */}
        {xLabelIdxs.map((idx) => {
          const x = padding.left + idx * stepX;
          return (
            <text
              key={idx}
              x={x}
              y={height - 6}
              fontSize="9"
              textAnchor="middle"
              fill="currentColor"
              opacity="0.6"
            >
              {series[idx].day.slice(5)}
            </text>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-end gap-4 text-[11px] text-[var(--color-text-3)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-[var(--color-accent)]" /> Creados
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-[var(--color-success)]" /> Resueltos
        </span>
      </div>
    </div>
  );
}
