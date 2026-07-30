"use client";

import type { ReactNode } from "react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
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
  feedbackTarget?: { id: string; label: string } | null;
  hideFeedback?: boolean;
  alertTone?: "warn" | "error" | null;
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
  feedbackTarget,
  hideFeedback = false,
  alertTone = null,
}: WidgetCardFrameProps) {
  const showFeedback = feedbackTarget && !hideFeedback && !presentationMode;

  return (
    <div
      ref={exportRootRef}
      role={role}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      onMouseDown={onMouseDown}
      className={cn(
        "dashboard-widget-card group/card relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-[box-shadow,border-color] duration-300",
        !presentationMode && "hover:border-[color-mix(in_oklab,var(--color-border)_65%,var(--color-accent)_35%)]",
        isEditing && "ring-1 ring-[var(--color-accent)]/30",
        isKeyboardFocused && "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-surface)]",
        alertTone === "warn" && "dashboard-widget-card--alert-warn",
        alertTone === "error" && "dashboard-widget-card--alert-error",
        className,
      )}
      style={{ ["--chart-accent" as string]: accentColor }}
    >
      {showFeedback ? (
        <FeedbackTargetButton
          placement="corner"
          id={feedbackTarget.id}
          label={feedbackTarget.label}
        />
      ) : null}
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
