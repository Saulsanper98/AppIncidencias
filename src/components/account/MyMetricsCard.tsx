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
 */

import { useEffect, useState } from "react";
import { Award, Clock3, Layers, Target, Trophy } from "lucide-react";

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
      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-[var(--color-surface-2)]" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-[var(--color-surface-2)]/60"
            />
          ))}
        </div>
      </div>
    );
  }
  if (error || !data) return null;

  const slaColor =
    data.slaCompliancePercent == null
      ? "text-[var(--color-text-2)]"
      : data.slaCompliancePercent >= 90
        ? "text-[var(--color-success)]"
        : data.slaCompliancePercent >= 75
          ? "text-[var(--color-warning)]"
          : "text-[var(--color-error)]";

  return (
    <section
      aria-labelledby="my-metrics-heading"
      className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2
          id="my-metrics-heading"
          className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-1)]"
        >
          <Trophy size={16} className="text-[var(--color-accent)]" aria-hidden />
          Mi rendimiento (últimos 30 días)
        </h2>
        {data.ranking.myRank ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-light)] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)]">
            <Award size={12} aria-hidden />
            Puesto {data.ranking.myRank} de {data.ranking.total}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            Resueltos
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--color-text-1)]">
            {data.resolvedByMe.last30}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-3)]">
            últimos 30d · {data.resolvedByMe.last7} en 7d · {data.resolvedByMe.last90} en 90d
          </p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            Mis asignados ahora
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--color-text-1)]">
            {data.currentlyAssigned}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-3)]">tickets activos</p>
          <a
            href="/tickets?mine=1"
            className="mt-2 inline-flex items-center text-[11px] font-medium text-[var(--color-accent)] hover:underline"
          >
            Ver mis tickets
          </a>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            <Clock3 size={11} aria-hidden /> MTTR medio
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--color-text-1)]">
            {formatMs(data.mttrMs)}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-3)]">mis tickets resueltos</p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            <Target size={11} aria-hidden /> SLA cumplido
          </p>
          <p className={cn("mt-2 text-2xl font-bold tabular-nums", slaColor)}>
            {data.slaCompliancePercent == null ? "—" : `${data.slaCompliancePercent}%`}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-3)]">en mis resueltos 30d</p>
        </div>
      </div>

      {data.topTipologias.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 p-3">
          <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            <Layers size={11} aria-hidden /> Top tipologías que has atendido
          </p>
          <ul className="space-y-1">
            {data.topTipologias.map((tip) => (
              <li
                key={`${tip.tipo}-${tip.subtipo}`}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0 truncate text-[var(--color-text-2)]">
                  <span className="font-medium text-[var(--color-text-1)]">{tip.tipo}</span>
                  {tip.subtipo !== "—" ? (
                    <span className="text-[var(--color-text-3)]"> · {tip.subtipo}</span>
                  ) : null}
                </span>
                <span className="shrink-0 rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-text-2)]">
                  {tip.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
