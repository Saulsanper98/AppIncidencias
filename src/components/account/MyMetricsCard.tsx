"use client";

/**
 * Tarjeta de "Mi rendimiento" para la página `/account`.
 *
 * Consume `/api/metrics/me` y pinta cuatro bloques de información:
 *   1. Tickets resueltos por mí (7d / 30d / 90d).
 *   2. Asignados actualmente + ranking entre técnicos.
 *   3. MTTR medio y % SLA cumplido (30d).
 *   4. Top 5 tipologías que he atendido en 30d.
 *
 * La tarjeta se autodescarga si el endpoint da 401 (visitante sin sesión) o
 * cualquier otro error, evitando emborronar la página de cuenta.
 *
 * Pase visual premium: tiles tinted por tono con gradient en el número,
 * iconos en wrap con glow, ranking badge con podio (gold/silver/bronze) y
 * top tipologías con barras de progreso.
 */

import { useEffect, useState } from "react";
import { Award, BarChart3, CheckCircle2, Clock3, Layers, Target, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

type MetricsPayload = {
  resolvedByMe: { last7: number; last30: number; last90: number };
  currentlyAssigned: number;
  mttrMs: number | null;
  slaCompliancePercent: number | null;
  topTipologias: { tipo: string; subtipo: string; count: number; nivel: string | null }[];
  ranking: { myRank: number | null; total: number };
};

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem.toString().padStart(2, "0")}m`;
}

/**
 * Devuelve el tinte CSS de la medalla del ranking. Top 3 = oro/plata/bronce
 * (estilo podio); fuera del top usa el tono accent normal.
 */
function rankTone(rank: number | null): string {
  if (rank === 1) return "#f5b942"; // oro
  if (rank === 2) return "#b9c3cf"; // plata
  if (rank === 3) return "#c47e3a"; // bronce
  return "var(--color-accent)";
}

export function MyMetricsCard() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/metrics/me", { cache: "no-store" });
        if (!res.ok) {
          setError("No se pudieron cargar las métricas.");
          return;
        }
        const json = (await res.json()) as MetricsPayload;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("No se pudieron cargar las métricas.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="account-section">
        <div className="mb-4 h-4 w-40 animate-pulse rounded bg-[var(--color-surface-2)]" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl bg-[var(--color-surface-2)]/60"
            />
          ))}
        </div>
      </div>
    );
  }
  if (error || !data) return null;

  // Tinte del SLA segun cumplimiento (success / warning / error).
  const slaToneVar =
    data.slaCompliancePercent == null
      ? undefined
      : data.slaCompliancePercent >= 90
        ? "var(--color-success)"
        : data.slaCompliancePercent >= 75
          ? "var(--color-warning)"
          : "var(--color-error)";

  // Maximo para escalar las barras de top tipologias.
  const maxTipoCount = Math.max(1, ...data.topTipologias.map((t) => t.count));

  return (
    <section aria-labelledby="my-metrics-heading" className="account-section">
      <div className="account-section-head flex-wrap justify-between">
        <div className="flex items-center gap-3">
          <span
            className="account-section-icon"
            style={{ ["--section-tone" as string]: "var(--color-accent)" }}
            aria-hidden
          >
            <BarChart3 size={18} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <p className="account-section-pretitle">
              <span
                className="account-section-pretitle-dot"
                style={{ ["--section-tone" as string]: "var(--color-accent)" }}
                aria-hidden
              />
              Rendimiento
            </p>
            <h2 id="my-metrics-heading" className="account-section-title">
              Mi rendimiento <span className="text-[var(--color-text-3)]">· últimos 30 días</span>
            </h2>
          </div>
        </div>
        {data.ranking.myRank ? (
          <span
            className="account-rank-badge"
            style={{ ["--rank-tone" as string]: rankTone(data.ranking.myRank) }}
            title={
              data.ranking.myRank <= 3
                ? `Estás en el podio: puesto ${data.ranking.myRank} de ${data.ranking.total}`
                : `Puesto ${data.ranking.myRank} de ${data.ranking.total}`
            }
          >
            {data.ranking.myRank <= 3 ? (
              <Trophy size={13} strokeWidth={2} aria-hidden />
            ) : (
              <Award size={13} strokeWidth={2} aria-hidden />
            )}
            Puesto {data.ranking.myRank} de {data.ranking.total}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div
          className="account-kpi-tile"
          style={{ ["--kpi-tone" as string]: "var(--color-accent)" }}
        >
          <p className="account-kpi-tile-head">
            <span className="account-kpi-tile-icon">
              <CheckCircle2 size={13} strokeWidth={1.8} aria-hidden />
            </span>
            Resueltos
          </p>
          <p className="account-kpi-tile-value">{data.resolvedByMe.last30}</p>
          <p className="account-kpi-tile-hint">
            últimos 30d · {data.resolvedByMe.last7} en 7d · {data.resolvedByMe.last90} en 90d
          </p>
        </div>

        <div
          className="account-kpi-tile"
          style={
            data.currentlyAssigned > 0
              ? { ["--kpi-tone" as string]: "var(--color-warning)" }
              : undefined
          }
        >
          <p className="account-kpi-tile-head">
            <span className="account-kpi-tile-icon">
              <Layers size={13} strokeWidth={1.8} aria-hidden />
            </span>
            Mis asignados ahora
          </p>
          <p
            className={cn(
              "account-kpi-tile-value",
              data.currentlyAssigned === 0 && "account-kpi-tile-value--neutral",
            )}
          >
            {data.currentlyAssigned}
          </p>
          <p className="account-kpi-tile-hint">tickets activos</p>
          <a href="/tickets?mine=1" className="account-kpi-tile-link">
            Ver mis tickets →
          </a>
        </div>

        <div className="account-kpi-tile">
          <p className="account-kpi-tile-head">
            <span className="account-kpi-tile-icon">
              <Clock3 size={13} strokeWidth={1.8} aria-hidden />
            </span>
            MTTR medio
          </p>
          <p className="account-kpi-tile-value account-kpi-tile-value--neutral">
            {formatMs(data.mttrMs)}
          </p>
          <p className="account-kpi-tile-hint">mis tickets resueltos</p>
        </div>

        <div
          className="account-kpi-tile"
          style={slaToneVar ? { ["--kpi-tone" as string]: slaToneVar } : undefined}
        >
          <p className="account-kpi-tile-head">
            <span className="account-kpi-tile-icon">
              <Target size={13} strokeWidth={1.8} aria-hidden />
            </span>
            SLA cumplido
          </p>
          <p
            className={cn(
              "account-kpi-tile-value",
              !slaToneVar && "account-kpi-tile-value--neutral",
            )}
          >
            {data.slaCompliancePercent == null ? "—" : `${data.slaCompliancePercent}%`}
          </p>
          <p className="account-kpi-tile-hint">en mis resueltos 30d</p>
        </div>
      </div>

      {data.topTipologias.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
          <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-3)]">
            <Layers size={11} aria-hidden /> Top tipologías que has atendido
          </p>
          <ul className="space-y-0.5">
            {data.topTipologias.map((tip) => {
              const pct = Math.round((tip.count / maxTipoCount) * 100);
              return (
                <li key={`${tip.tipo}-${tip.subtipo}`} className="account-typo-row text-sm">
                  <span className="min-w-0 truncate text-[var(--color-text-2)]">
                    <span className="font-semibold text-[var(--color-text-1)]">{tip.tipo}</span>
                    {tip.subtipo !== "—" ? (
                      <span className="text-[var(--color-text-3)]"> · {tip.subtipo}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--color-text-2)]">
                    {tip.count}
                  </span>
                  <div className="account-typo-row-bar">
                    <div className="account-typo-row-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
