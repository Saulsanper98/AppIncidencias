import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";

const badgeClasses: Record<BadgeVariant, string> = {
  success: "bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success)]/30",
  warning: "bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[var(--color-warning)]/30",
  error: "bg-[var(--color-error-light)] text-[var(--color-error)] border-[var(--color-error)]/30",
  info: "bg-[rgba(99,102,241,0.15)] text-indigo-300 border-indigo-400/20",
  neutral: "bg-[var(--color-surface-2)] text-[var(--color-text-2)] border-[var(--color-border)]",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        badgeClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
