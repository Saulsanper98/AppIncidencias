"use client";

import { BarChart3, Bus, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { KpisData } from "./dashboard-types";

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem.toString().padStart(2, "0")}m`;
}

export function DashboardOperationalDetail({
  loading,
  kpis,
}: {
  loading: boolean;
  kpis: KpisData | null;
}) {
  const unassigned = kpis?.unassignedAgedCount ?? 0;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && kpis) {
      setOpen(unassigned > 0);
    }
  }, [loading, kpis, unassigned]);

  if (loading) {
    return (
      <section className="account-section" aria-label="Detalle operativo">
        <Skeleton className="h-10 w-full rounded-lg" />
      </section>
    );
  }
  if (!kpis) return null;

  const mttr = kpis.mttrByPriority ?? { alta: null, media: null, baja: null };
  const topBuses = kpis.topBuses ?? [];

  return (
    <section className="account-section ccmgc-stagger-in ccmgc-stagger-in-6" aria-label="Detalle operativo">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="account-section-head !mb-0 w-full cursor-pointer text-left transition-opacity hover:opacity-90"
        aria-expanded={open}
      >
        <span className="account-section-icon shrink-0">
          <BarChart3 size={16} strokeWidth={1.6} className="text-[var(--color-accent)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="account-section-pretitle">
            <span className="account-section-pretitle-dot" aria-hidden />
            Análisis operativo
          </p>
          <h2 className="account-section-title !mt-0">Detalle de cola y flota</h2>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-[var(--color-text-3)] transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <SectionCard title="MTTR por prioridad (30d)">
            {(() => {
              const maxMttr = Math.max(
                ...(["alta", "media", "baja"] as const).map((p) => mttr[p] ?? 0),
                1,
              );
              return (
                <ul className="space-y-2.5">
                  {(["alta", "media", "baja"] as const).map((prio) => {
                    const dotClass =
                      prio === "alta"
                        ? "bg-[var(--color-error)]"
                        : prio === "media"
                          ? "bg-[var(--color-warning)]"
                          : "bg-[var(--color-success)]";
                    const colorVar =
                      prio === "alta"
                        ? "var(--color-error)"
                        : prio === "media"
                          ? "var(--color-warning)"
                          : "var(--color-success)";
                    const label = prio.charAt(0).toUpperCase() + prio.slice(1);
                    const value = mttr[prio];
                    const fillPct = value == null || value <= 0 ? 0 : Math.round((value / maxMttr) * 100);
                    return (
                      <li key={prio} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="inline-flex items-center gap-2 text-[var(--color-text-2)]">
                            <span className={cn("h-2 w-2 rounded-full", dotClass)} aria-hidden />
                            {label}
                          </span>
                          <span className="font-semibold tabular-nums text-[var(--color-text-1)]">
                            {formatMs(value)}
                          </span>
                        </div>
                        <div className="dashboard-mttr-bar">
                          <div
                            className="dashboard-mttr-bar-fill"
                            style={{ width: `${fillPct}%`, ["--mttr-color" as string]: colorVar }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </SectionCard>

          <SectionCard title="Top buses (30d)">
            {topBuses.length === 0 ? (
              <EmptyState
                icon={Bus}
                title="Sin datos suficientes"
                hint="Cuando haya tickets en 30 días, aquí verás los buses con más incidencias."
                compact
              />
            ) : (
              (() => {
                const maxTickets = Math.max(...topBuses.slice(0, 5).map((b) => b.ticketCount), 1);
                return (
                  <ol className="space-y-1.5">
                    {topBuses.slice(0, 5).map((b, idx) => {
                      const fillPct = Math.max(8, Math.round((b.ticketCount / maxTickets) * 100));
                      return (
                        <li
                          key={b.busId}
                          className="dashboard-topbus-row flex items-center justify-between gap-2 text-sm"
                          style={{ ["--bus-fill" as string]: `${fillPct}%` }}
                          title={[b.operator, b.municipio].filter(Boolean).join(" · ")}
                        >
                          <span className="flex min-w-0 items-center gap-2 text-[var(--color-text-2)]">
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[10px] font-semibold tabular-nums text-[var(--color-text-3)]">
                              {idx + 1}
                            </span>
                            <Link
                              href={`/bandeja?busId=${encodeURIComponent(b.busId)}`}
                              className="truncate font-mono text-[13px] text-[var(--color-text-1)] hover:underline"
                            >
                              {b.busId}
                            </Link>
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-text-2)]">
                            {b.ticketCount}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                );
              })()
            )}
          </SectionCard>
        </div>
      ) : null}
    </section>
  );
}
