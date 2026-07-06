"use client";

import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  startIcon?: ReactNode;
  loading?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] border border-transparent shadow-[0_4px_14px_-6px_rgba(59,130,246,0.45)]",
  secondary:
    "bg-[var(--color-accent-light)] text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)] border border-[var(--color-border)]",
  ghost:
    "bg-transparent text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)] border border-[var(--color-border)]",
  danger: "bg-[var(--color-error)] text-white hover:opacity-90 border border-transparent",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-sm min-h-[44px]",
  md: "px-4 py-2.5 text-sm min-h-[44px]",
  lg: "px-4 py-3 text-sm min-h-[44px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", startIcon, children, loading, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "ccmgc-btn inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
        variantClasses[variant],
        sizeClasses[size],
        loading && "opacity-90",
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : startIcon}
      <span className={cn(loading && "opacity-70")}>{children}</span>
    </button>
  );
});
