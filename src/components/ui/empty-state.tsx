import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
};

/**
 * Empty state canonico (.ccmgc-empty). Sustituye bloques ad-hoc repartidos
 * en tickets, bandeja, novedades, etc.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("ccmgc-empty", compact && "!py-6", className)}>
      <span className={cn("ccmgc-empty-icon", compact && "!h-11 !w-11")}>
        <Icon size={compact ? 22 : 26} strokeWidth={1.5} aria-hidden />
      </span>
      <p className="ccmgc-empty-title">{title}</p>
      <p className="ccmgc-empty-hint">{hint}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/40 px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] transition-all duration-150 hover:bg-[var(--color-accent-light)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
