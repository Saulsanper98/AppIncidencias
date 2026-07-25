"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type WidgetCardFrameProps = {
  accentColor: string;
  children: ReactNode;
  className?: string;
  presentationMode?: boolean;
  isEditing?: boolean;
  isKeyboardFocused?: boolean;
  onMouseDown?: () => void;
  exportRootRef?: React.Ref<HTMLDivElement | null>;
  role?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
};

export function WidgetCardFrame({
  accentColor,
  children,
  className,
  presentationMode,
  isEditing,
  isKeyboardFocused,
  onMouseDown,
  exportRootRef,
  role = "region",
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: WidgetCardFrameProps) {
  return (
    <div
      ref={exportRootRef}
      role={role}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      onMouseDown={onMouseDown}
      className={cn(
        "dashboard-widget-card group/card relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-shadow duration-200",
        !presentationMode && "hover:shadow-md hover:border-[color-mix(in_oklab,var(--color-border)_70%,var(--color-accent)_30%)]",
        isEditing && "ring-1 ring-[var(--color-accent)]/25",
        isKeyboardFocused && "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-surface)]",
        className,
      )}
    >
      <div
        aria-hidden
        className="h-[3px] w-full shrink-0"
        style={{
          background: `linear-gradient(90deg, ${accentColor}, color-mix(in oklab, ${accentColor} 35%, transparent))`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover/card:opacity-100"
        style={{ background: `color-mix(in oklab, ${accentColor} 22%, transparent)` }}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
