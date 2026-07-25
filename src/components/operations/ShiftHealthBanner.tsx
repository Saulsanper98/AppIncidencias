"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, HeartPulse } from "lucide-react";
import { useEffect, useState } from "react";

import type { ShiftHealthSnapshot } from "@/lib/operations/shift-health";
import { SHIFT_LABEL } from "@/lib/shift-utils";
import { cn } from "@/lib/utils";

/**
 * Banner compacto de “salud del turno” para dashboard / sala.
 * Consume GET /api/operations/shift-health.
 */
export function ShiftHealthBanner({ className }: { className?: string }) {
  const [health, setHealth] = useState<ShiftHealthSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/operations/shift-health", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as ShiftHealthSnapshot;
        if (!cancelled) setHealth(data);
      } catch {
        /* silencioso: banner opcional */
      }
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!health || health.score === "ok") return null;

  const tone =
    health.score === "critical"
      ? "border-[var(--color-error)]/35 bg-[var(--color-error-light)] text-[var(--color-error)]"
      : "border-[var(--color-warning)]/35 bg-[var(--color-warning-light)] text-[var(--color-warning)]";

  return (
    <aside
      className={cn(
        "flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        tone,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-start gap-3">
        {health.score === "critical" ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        ) : (
          <HeartPulse className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text)]">
            Salud del turno {SHIFT_LABEL[health.shift]}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-2)]">
            {health.headlines.join(" · ") || "Revisa bandeja y handover"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        {health.slaOverdue > 0 ? (
          <Link
            href="/bandeja?sla=overdue"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)]"
          >
            SLA <ArrowRight size={12} aria-hidden />
          </Link>
        ) : null}
        {health.unackedHandovers > 0 || health.openPendingItems > 0 ? (
          <Link
            href="/handover?tab=unacked"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)]"
          >
            Handover <ArrowRight size={12} aria-hidden />
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
