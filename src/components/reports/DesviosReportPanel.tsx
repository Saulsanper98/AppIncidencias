"use client";

import { Loader2, Route } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type DesviosReport = {
  days: number;
  total: number;
  activos: number;
  pendientes: number;
  byEstado: Record<string, number>;
  byOrigen: Record<string, number>;
  topLineas: Array<{ linea: string; count: number }>;
};

const DAY_OPTIONS = [7, 30, 90] as const;

export function DesviosReportPanel() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<DesviosReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/desvios?days=${days}`, { cache: "no-store" });
      if (!res.ok) return;
      setData((await res.json()) as DesviosReport);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-light)] text-[var(--color-accent)]">
            <Route size={18} aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-1)]">Desvíos</h2>
            <p className="text-xs text-[var(--color-text-3)]">Resumen por estado, origen y líneas más afectadas.</p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg border border-[var(--color-border)] p-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                days === d ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-3)]",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-[var(--color-text-3)]">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Cargando…
        </div>
      ) : data ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total" value={data.total} />
          <Stat label="Activos" value={data.activos} accent />
          <Stat label="Pendientes" value={data.pendientes} warn />
          <Stat label="Periodo" value={`${data.days} días`} />
        </div>
      ) : null}

      {data && !loading ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <MiniTable title="Por estado" rows={Object.entries(data.byEstado)} />
          <MiniTable title="Por origen" rows={Object.entries(data.byOrigen)} />
          <div className="lg:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
              Líneas más afectadas
            </h3>
            <ul className="mt-2 space-y-1">
              {data.topLineas.length === 0 ? (
                <li className="text-xs text-[var(--color-text-3)]">Sin datos de líneas.</li>
              ) : (
                data.topLineas.map((row) => (
                  <li
                    key={row.linea}
                    className="flex justify-between rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs"
                  >
                    <span>{row.linea}</span>
                    <span className="font-semibold tabular-nums">{row.count}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value, accent, warn }: { label: string; value: string | number; accent?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-3)]">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          warn ? "text-[var(--color-warning)]" : accent ? "text-[var(--color-accent)]" : "text-[var(--color-text-1)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MiniTable({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-3)]">{title}</h3>
      <ul className="mt-2 space-y-1">
        {rows.length === 0 ? (
          <li className="text-xs text-[var(--color-text-3)]">Sin datos.</li>
        ) : (
          rows.map(([key, count]) => (
            <li key={key} className="flex justify-between rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs">
              <span>{key}</span>
              <span className="font-semibold tabular-nums">{count}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
