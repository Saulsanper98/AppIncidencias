"use client";

/**
 * Banner colapsable de buses anómalos (preventivo / dashboard).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

type AnomalousBus = {
  busId: string;
  ticketCount: number;
  score: number;
  topTypes: { tipo: string; count: number }[];
  operator: string | null;
  municipio: string | null;
  zScore: number | null;
};

type Payload = {
  windowDays: number;
  zscoreThreshold?: number;
  usingWeights?: boolean;
  stats: { mean: number; stddev: number; threshold: number };
  anomalous: AnomalousBus[];
};

export function AnomalousBusesBanner() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/buses/anomalous", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Payload;
        if (!cancelled) setData(json);
      } catch {
        /* no crítico */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (!data || data.anomalous.length === 0) return null;

  const count = data.anomalous.length;

  return (
    <section
      role="region"
      aria-label="Buses con incidencia elevada"
      className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning-light)]/50 p-4 print:hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-warning)]/20">
            <AlertTriangle size={14} className="text-[var(--color-warning)]" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-1)]">
              {count === 1
                ? "1 bus con incidencia elevada"
                : `${count} buses con incidencia elevada`}{" "}
              (últimos {data.windowDays} días)
            </p>
            <p className="text-[11px] text-[var(--color-text-3)]">
              Revisa si requieren mantenimiento intensivo o sustitución.
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-[var(--color-text-3)]" aria-hidden />
        ) : (
          <ChevronDown size={16} className="text-[var(--color-text-3)]" aria-hidden />
        )}
      </button>

      {open ? (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.anomalous.map((b) => (
            <li
              key={b.busId}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <Link
                  href={`/bandeja?busId=${encodeURIComponent(b.busId)}`}
                  className="block truncate font-mono text-[13px] font-semibold text-[var(--color-text-1)] hover:underline"
                >
                  {b.busId}
                </Link>
                <p className="truncate text-[11px] text-[var(--color-text-3)]">
                  {[b.operator, b.municipio].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <span className="inline-flex rounded-full bg-[var(--color-warning-light)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-warning)]">
                {b.ticketCount} tickets
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
