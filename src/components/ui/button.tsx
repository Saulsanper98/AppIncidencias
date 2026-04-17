"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  startIcon?: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] border border-transparent",
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
  { className, variant = "primary", size = "md", startIcon, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {startIcon}
      {children}
    </button>
  );
});
