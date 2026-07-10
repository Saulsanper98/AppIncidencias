"use client";

import { Bus, CheckCircle2, Eye, LayoutDashboard, Radio, RefreshCw } from "lucide-react";

import { DailyReportButton } from "@/components/daily-report-button";
import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { cn } from "@/lib/utils";

import { DashboardCriticalChip } from "./DashboardCriticalChip";
import { DashboardKpiStrip, getDashboardCriticalCounts } from "./DashboardKpiStrip";
import { OperationalNowCard } from "./OperationalNowCard";
import type { KpisData } from "./dashboard-types";

function relativeRefresh(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10) return "ahora mismo";
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  return `hace ${m} min`;
}

export function DashboardHero({
  dashboardView,
  onViewChange,
  loading,
  refreshing,
  refreshOk,
  lastRefresh,
  onRefresh,
  kpis,
}: {
  dashboardView: "operaciones" | "conductor";
  onViewChange: (view: "operaciones" | "conductor") => void;
  loading: boolean;
  refreshing: boolean;
  refreshOk: boolean;
  lastRefresh: Date;
  onRefresh: () => void;
  kpis: KpisData | null;
}) {
  const isConductor = dashboardView === "conductor";
  const critical = getDashboardCriticalCounts(loading, kpis);

  return (
    <header
      className={cn(
        "ccmgc-hero relative shrink-0 overflow-hidden rounded-2xl border p-3 shadow-sm sm:p-4",
        isConductor
          ? "dashboard-hero--conductor border-[var(--color-accent)]/35 bg-[linear-gradient(120deg,var(--color-accent-light),var(--color-surface))]"
          : "border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[var(--color-accent-light)]/25",
      )}
    >
      <div
        className="ccmgc-hero-parallax pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[var(--color-accent)]/12 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="dashboard-live-eyebrow" title="Datos actualizados en tiempo real">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-success)] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
              </span>
              En vivo
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
              {isConductor ? "Vista de campo" : "Centro de control"}
            </span>
          </div>
          <h1 className="dashboard-hero-title text-balance text-[20px] font-semibold leading-[1.1] tracking-tight sm:text-[24px]">
            {isConductor ? "Vista conductor" : "Panel operativo"}
          </h1>
          {!isConductor ? (
            <p className="mt-0.5 hidden text-sm text-[var(--color-text-2)] sm:block">
              Control en tiempo real · Flota de Gran Canaria
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-[var(--color-text-2)]">
              Resumen rápido para personal de campo
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <DailyReportButton />

          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 px-3 py-1.5">
            <Radio size={11} strokeWidth={1.8} className="text-[var(--color-success)]" aria-hidden />
            <span className="text-xs text-[var(--color-text-3)]">{relativeRefresh(lastRefresh)}</span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing || loading}
              title={refreshOk ? "Datos actualizados" : "Actualizar datos"}
              className={cn(
                "ml-0.5 flex items-center justify-center transition-colors disabled:opacity-40",
                refreshOk
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
              )}
            >
              {refreshOk ? (
                <CheckCircle2 size={12} className="ccmgc-pop" aria-hidden />
              ) : (
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} aria-hidden />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 p-1 pl-2.5">
            <Eye size={12} strokeWidth={1.5} className="text-[var(--color-text-3)]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
              Vista
            </span>
            <div className="flex gap-0.5">
              {(["operaciones", "conductor"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onViewChange(v)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
                    dashboardView === v
                      ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-text-1)]"
                      : "text-[var(--color-text-3)] hover:text-[var(--color-text-2)]",
                  )}
                >
                  {v === "operaciones" ? (
                    <LayoutDashboard size={12} strokeWidth={1.5} />
                  ) : (
                    <Bus size={12} strokeWidth={1.5} />
                  )}
                  {v === "operaciones" ? "Operaciones" : "Conductor"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!isConductor ? (
        <div className="relative mt-2.5 flex flex-col gap-2 border-t border-[var(--color-border)]/45 pt-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <DashboardCriticalChip
            slaVencidos={critical.slaVencidos}
            altaPrioridad={critical.altaPrioridad}
            loading={loading}
            className="shrink-0"
          />
          <DashboardKpiStrip loading={loading} kpis={kpis} />
          <FeedbackTargetButton
            id="dashboard/kpis"
            label="KPIs operativos"
            className="shrink-0 sm:ml-auto"
          />
        </div>
      ) : null}

      {!isConductor ? <OperationalNowCard /> : null}
    </header>
  );
}
