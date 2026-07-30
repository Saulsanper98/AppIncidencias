"use client";

import { Check, Copy, Download, Plus, Presentation, Redo2, RefreshCw, Settings2, Undo2 } from "lucide-react";

import type { DashboardPeriodComparison } from "@/lib/dashboard/dashboard-data-types";
import { formatPeriodDeltaLabel, periodDeltaTone } from "@/lib/dashboard/period-delta";
import { cn } from "@/lib/utils";

const DAY_OPTIONS = [7, 14, 30, 90] as const;

type DashboardBuilderToolbarProps = {
  days: number;
  onDaysChange: (days: number) => void;
  onRefresh: () => void;
  dataRefreshing: boolean;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  lastRefreshedAt: string | null;
  periodComparison?: DashboardPeriodComparison | null;
  isEditing: boolean;
  onToggleEditing: () => void;
  presentationMode: boolean;
  onTogglePresentation: () => void;
  onAddWidget?: () => void;
  canEdit: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onExportJson?: () => void;
  onDuplicateDashboard?: () => void;
  /** Sin borde/fondo propio: pensado para vivir dentro del hero del panel. */
  embedded?: boolean;
};

function DeltaChip({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "error" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums",
        tone === "success" && "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
        tone === "warning" && "border-amber-500/35 bg-amber-500/10 text-amber-200",
        tone === "error" && "border-rose-500/35 bg-rose-500/10 text-rose-300",
        tone === "neutral" && "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)]",
      )}
    >
      {label}
    </span>
  );
}

export function DashboardBuilderToolbar({
  days,
  onDaysChange,
  onRefresh,
  dataRefreshing,
  autoRefresh,
  onToggleAutoRefresh,
  lastRefreshedAt,
  periodComparison,
  isEditing,
  onToggleEditing,
  presentationMode,
  onTogglePresentation,
  onAddWidget,
  canEdit,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onExportJson,
  onDuplicateDashboard,
  embedded = false,
}: DashboardBuilderToolbarProps) {
  const createdDelta = periodComparison
    ? formatPeriodDeltaLabel(periodComparison.currentCreated, periodComparison.previousCreated, "creados")
    : null;
  const resolvedDelta = periodComparison
    ? formatPeriodDeltaLabel(periodComparison.currentResolved, periodComparison.previousResolved, "resueltos")
    : null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        embedded
          ? "border-t border-[var(--color-border)]/70 pt-3"
          : "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-2 shadow-sm backdrop-blur-sm",
      )}
    >
      <div className="inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5">
        {DAY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onDaysChange(option)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
              days === option
                ? "bg-[var(--color-accent)] text-white shadow-sm"
                : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
            )}
          >
            {option}d
          </button>
        ))}
      </div>

      {periodComparison && (createdDelta || resolvedDelta) ? (
        <div
          className="hidden items-center gap-1.5 md:flex"
          title={`Comparado con los ${periodComparison.days} días anteriores`}
        >
          {createdDelta ? (
            <DeltaChip
              label={createdDelta}
              tone={periodDeltaTone("created", periodComparison.currentCreated, periodComparison.previousCreated)}
            />
          ) : null}
          {resolvedDelta ? (
            <DeltaChip
              label={resolvedDelta}
              tone={periodDeltaTone("resolved", periodComparison.currentResolved, periodComparison.previousResolved)}
            />
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onRefresh}
        disabled={dataRefreshing}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-2)] transition-all hover:border-[var(--color-border-hover)] disabled:opacity-60"
      >
        <RefreshCw size={14} className={dataRefreshing ? "animate-spin" : undefined} />
        Actualizar
      </button>

      <button
        type="button"
        onClick={onToggleAutoRefresh}
        className={cn(
          "rounded-lg border px-3 py-2 text-xs font-medium transition-all",
          autoRefresh
            ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)]",
        )}
      >
        Auto 60s · {autoRefresh ? "ON" : "OFF"}
      </button>

      {lastRefreshedAt ? (
        <span className="hidden text-[11px] text-[var(--color-text-3)] sm:inline" title="Última actualización de datos">
          Actualizado {lastRefreshedAt}
        </span>
      ) : null}

      {canEdit ? (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {onExportJson ? (
            <button
              type="button"
              onClick={onExportJson}
              title="Exportar panel como JSON"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-2)] transition-all hover:border-[var(--color-border-hover)]"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          ) : null}
          {onDuplicateDashboard ? (
            <button
              type="button"
              onClick={onDuplicateDashboard}
              title="Duplicar panel completo"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-2)] transition-all hover:border-[var(--color-border-hover)]"
            >
              <Copy size={14} />
              <span className="hidden sm:inline">Duplicar</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onTogglePresentation}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all",
              presentationMode
                ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]",
            )}
          >
            <Presentation size={14} />
            {presentationMode ? "Salir" : "Presentación"}
          </button>
          {isEditing && onAddWidget ? (
            <button
              type="button"
              onClick={onAddWidget}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[var(--color-accent-hover)]"
            >
              <Plus size={14} />
              Widget
            </button>
          ) : null}
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                title="Deshacer (Ctrl+Z)"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] disabled:opacity-40"
              >
                <Undo2 size={14} />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                title="Rehacer (Ctrl+Y)"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] disabled:opacity-40"
              >
                <Redo2 size={14} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onToggleEditing}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all",
              isEditing
                ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]",
            )}
          >
            {isEditing ? (
              <>
                <Check size={14} />
                Listo
              </>
            ) : (
              <>
                <Settings2 size={14} />
                Editar
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
