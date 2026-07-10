"use client";

import { Check, Plus, Presentation, RefreshCw, Settings2 } from "lucide-react";

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
  isEditing: boolean;
  onToggleEditing: () => void;
  presentationMode: boolean;
  onTogglePresentation: () => void;
  onAddWidget?: () => void;
  canEdit: boolean;
};

export function DashboardBuilderToolbar({
  days,
  onDaysChange,
  onRefresh,
  dataRefreshing,
  autoRefresh,
  onToggleAutoRefresh,
  lastRefreshedAt,
  isEditing,
  onToggleEditing,
  presentationMode,
  onTogglePresentation,
  onAddWidget,
  canEdit,
}: DashboardBuilderToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-2 shadow-sm backdrop-blur-sm">
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
        <span className="hidden text-[11px] text-[var(--color-text-3)] sm:inline">· {lastRefreshedAt}</span>
      ) : null}

      {canEdit ? (
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
