"use client";

import { AlertTriangle, Clock, Mail, RefreshCw, Server } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type HealthPayload = {
  poller: {
    enabled: boolean;
    provider: string;
    running: boolean;
    lastRunAt: string | null;
    lastError: string | null;
    totalChecks: number;
    totalCreated: number;
  };
  scheduler: {
    enabled: boolean;
    running: boolean;
    lastTickAt: string | null;
    lastError: string | null;
    dailyReportHour: number;
    lastDailyReportDate: string | null;
  };
  env: {
    nodeEnv: string;
    databaseConfigured: boolean;
    emailProvider: string;
    resendConfigured: boolean;
    vapidConfigured: boolean;
    tlsConfigured: boolean;
  };
  disk?: { freeGb: number; totalGb: number } | null;
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        ok ? "bg-emerald-500/15 text-emerald-300" : "bg-[var(--color-error)]/15 text-[var(--color-error)]",
      )}
    >
      {label}
    </span>
  );
}

export function OperationsHealthPanel() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operations/health", { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo cargar el estado");
      setData((await res.json()) as HealthPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-4 text-sm">
        {error}
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const pollerOk = data.poller.enabled ? data.poller.running && !data.poller.lastError : true;
  const schedulerOk = data.scheduler.enabled ? data.scheduler.running && !data.scheduler.lastError : true;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-2)] transition-colors hover:text-[var(--color-accent)]"
        >
          <RefreshCw size={12} aria-hidden />
          Actualizar estado
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-2)]">
              <Mail size={13} aria-hidden />
              Poller desvíos
            </span>
            <StatusPill ok={pollerOk} label={pollerOk ? "OK" : "Revisar"} />
          </div>
          <dl className="space-y-1 text-[11px] text-[var(--color-text-3)]">
            <div className="flex justify-between gap-2">
              <dt>Proveedor</dt>
              <dd className="font-medium text-[var(--color-text-2)]">{data.poller.provider}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Última ejecución</dt>
              <dd>{data.poller.lastRunAt ? new Date(data.poller.lastRunAt).toLocaleString("es-ES") : "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Creados</dt>
              <dd>{data.poller.totalCreated}</dd>
            </div>
          </dl>
          {data.poller.lastError ? (
            <p className="mt-2 text-[11px] text-[var(--color-error)]">{data.poller.lastError}</p>
          ) : null}
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-2)]">
              <Clock size={13} aria-hidden />
              Scheduler
            </span>
            <StatusPill ok={schedulerOk} label={schedulerOk ? "OK" : "Revisar"} />
          </div>
          <dl className="space-y-1 text-[11px] text-[var(--color-text-3)]">
            <div className="flex justify-between gap-2">
              <dt>Informe diario</dt>
              <dd>{data.scheduler.lastDailyReportDate ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Hora informe</dt>
              <dd>{data.scheduler.dailyReportHour}:00</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Último tick</dt>
              <dd>{data.scheduler.lastTickAt ? new Date(data.scheduler.lastTickAt).toLocaleString("es-ES") : "—"}</dd>
            </div>
          </dl>
          {data.scheduler.lastError ? (
            <p className="mt-2 text-[11px] text-[var(--color-error)]">{data.scheduler.lastError}</p>
          ) : null}
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:col-span-2">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-2)]">
            <Server size={13} aria-hidden />
            Configuración
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill ok={data.env.databaseConfigured} label="BD" />
            <StatusPill ok={data.env.emailProvider !== "disabled"} label="Email desvíos" />
            <StatusPill ok={data.env.resendConfigured} label="Resend" />
            <StatusPill ok={data.env.vapidConfigured} label="Push" />
            <StatusPill ok={data.env.tlsConfigured} label="TLS" />
          </div>
          {data.disk ? (
            <p className="mt-2 text-[11px] text-[var(--color-text-3)]">
              Disco libre: {data.disk.freeGb} GB / {data.disk.totalGb} GB
            </p>
          ) : null}
        </section>
      </div>

      {!data.env.emailProvider || data.env.emailProvider === "disabled" ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          Configura EMAIL_PROVIDER en .env para importar circulares de desvíos automáticamente.
        </p>
      ) : null}
    </div>
  );
}
