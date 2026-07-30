"use client";

import Link from "next/link";
import { Bus, CheckCircle2, LayoutDashboard, NotebookPen, RefreshCw } from "lucide-react";

import { DailyReportButton } from "@/components/daily-report-button";
import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { HeroShell } from "@/components/ui/hero-shell";
import { cn } from "@/lib/utils";

import { DashboardCriticalChip } from "./DashboardCriticalChip";
import { DashboardKpiStrip, getDashboardCriticalCounts } from "./DashboardKpiStrip";
import { OperationalNowCard } from "./OperationalNowCard";
import type { KpisData } from "./dashboard-types";

function relativeRefresh(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10) return "ahora";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m} min`;
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
    <HeroShell
      variant="ccmgc-hero"
      className={cn(
        "!mb-3 shadow-sm",
        isConductor &&
          "dashboard-hero--conductor !border-[var(--color-accent)]/35 bg-[linear-gradient(120deg,var(--color-accent-light),var(--color-surface))]",
      )}
      pulse
      dotColor={isConductor ? "var(--hero-accent-conductor)" : "var(--color-success)"}
      eyebrow={
        <span className="inline-flex flex-wrap items-center gap-2">
          En vivo
          <span className="font-semibold normal-case tracking-normal text-[var(--color-text-3)]">
            · {isConductor ? "Campo" : "Centro de control"}
          </span>
        </span>
      }
      title={isConductor ? "Vista conductor" : "Panel operativo"}
      subtitle={isConductor ? "Resumen para personal de campo" : undefined}
      actions={
        <>
          <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 p-0.5">
            {(["operaciones", "conductor"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onViewChange(v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  dashboardView === v
                    ? "bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-sm"
                    : "text-[var(--color-text-3)] hover:text-[var(--color-text-2)]",
                )}
              >
                {v === "operaciones" ? (
                  <LayoutDashboard size={12} strokeWidth={1.5} aria-hidden />
                ) : (
                  <Bus size={12} strokeWidth={1.5} aria-hidden />
                )}
                <span className="hidden sm:inline">{v === "operaciones" ? "Operaciones" : "Conductor"}</span>
              </button>
            ))}
          </div>

          <Link
            href="/bitacora/nueva?kind=nota"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-1)] transition-colors hover:border-[var(--color-accent)]/40"
            title="Nueva nota en bitácora"
          >
            <NotebookPen size={13} strokeWidth={1.8} aria-hidden />
            <span className="hidden sm:inline">Nota</span>
          </Link>
          <DailyReportButton />

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing || loading}
            title={refreshOk ? `Actualizado ${relativeRefresh(lastRefresh)}` : "Actualizar datos"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
              refreshOk
                ? "text-[var(--color-success)]"
                : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
            )}
          >
            {refreshOk ? (
              <CheckCircle2 size={13} className="ccmgc-pop" aria-hidden />
            ) : (
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} aria-hidden />
            )}
            <span className="hidden tabular-nums text-[var(--color-text-3)] sm:inline">
              {relativeRefresh(lastRefresh)}
            </span>
          </button>
        </>
      }
      kpis={
        !isConductor ? (
          <>
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
          </>
        ) : undefined
      }
    >
      {!isConductor ? <OperationalNowCard /> : null}
    </HeroShell>
  );
}
