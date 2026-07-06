import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  icon: LucideIcon;
  title: string;
  hint: string;
  retryLabel?: string;
  onRetry?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
};

/** Estado de error canónico con CTA Reintentar (Ola 4 #529). */
export function ErrorState({
  icon: Icon,
  title,
  hint,
  retryLabel = "Reintentar",
  onRetry,
  actionLabel,
  onAction,
  compact = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "ccmgc-error-banner flex flex-col items-center text-center",
        compact && "!py-5",
        className,
      )}
      role="alert"
    >
      <span className={cn("ccmgc-empty-icon text-[var(--color-error)]", compact && "!h-11 !w-11")}>
        <Icon size={compact ? 22 : 26} strokeWidth={1.5} aria-hidden />
      </span>
      <p className="ccmgc-empty-title">{title}</p>
      <p className="ccmgc-empty-hint">{hint}</p>
      {onRetry || onAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button type="button" variant="primary" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {onAction && actionLabel ? (
            <Button type="button" variant="secondary" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
