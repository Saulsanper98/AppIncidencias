"use client";

import { Loader2, Mail, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type PollerStatus = {
  enabled: boolean;
  provider: string;
  running: boolean;
  lastRunAt: string | null;
  lastError: string | null;
};

export function PollerStatusChip() {
  const [status, setStatus] = useState<PollerStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/operations/health-lite", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { poller: PollerStatus };
        if (!cancelled) setStatus(data.poller);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) return null;

  const ok = status.enabled ? status.running && !status.lastError : false;
  const label = !status.enabled
    ? "Email desvíos: desactivado"
    : status.lastError
      ? "Poller: error"
      : status.running
        ? `Poller ${status.provider}`
        : "Poller detenido";

  return (
    <span
      title={
        status.lastRunAt
          ? `Última ejecución: ${new Date(status.lastRunAt).toLocaleString("es-ES")}`
          : status.lastError ?? undefined
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
        ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-200",
      )}
    >
      <Mail size={11} aria-hidden />
      {label}
      {status.lastError ? <RefreshCw size={10} className="opacity-70" aria-hidden /> : null}
    </span>
  );
}
