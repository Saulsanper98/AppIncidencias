"use client";

import { CountUp } from "@/components/ui/count-up";
import { cn } from "@/lib/utils";

export type KpiTone = "neutral" | "info" | "accent" | "warning" | "success" | "error" | "violet";

export function kpiToneValueClass(tone: KpiTone): string {
  switch (tone) {
    case "info":
    case "accent":
      return "text-[var(--color-accent)]";
    case "warning":
      return "text-[var(--color-warning)]";
    case "success":
      return "text-[var(--color-success)]";
    case "error":
      return "text-[var(--color-error)]";
    case "violet":
      return "text-violet-400";
    default:
      return "text-[var(--color-text-1)]";
  }
}

const TONE_VAR: Record<KpiTone, string | undefined> = {
  neutral: undefined,
  info: "var(--color-accent)",
  accent: "var(--color-accent)",
  warning: "var(--color-warning)",
  success: "var(--color-success)",
  error: "var(--color-error)",
  violet: "#a855f7",
};

type KpiPillProps = {
  label: string;
  value?: number;
  /** Sustituye el valor numérico en layout stacked (p. ej. nombre de panel). */
  textValue?: string;
  tone?: KpiTone;
  icon?: React.ReactNode;
  pulse?: boolean;
  compact?: boolean;
  /** Variante apilada para grids tipo preventivo/admin. */
  layout?: "pill" | "stacked";
  hint?: string;
  animateValue?: boolean;
  className?: string;
  onClick?: () => void;
  title?: string;
};

/**
 * Pill KPI unificada — única fuente visual para métricas (p6).
 */
export function KpiPill({
  label,
  value = 0,
  textValue,
  tone = "neutral",
  icon,
  pulse = false,
  compact = false,
  layout = "pill",
  hint,
  animateValue = true,
  className,
  onClick,
  title,
}: KpiPillProps) {
  const toneVar = TONE_VAR[tone];
  const Tag = onClick ? "button" : "span";

  if (layout === "stacked") {
    const toneCls =
      tone === "accent"
        ? "ring-[var(--color-accent)]/25 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
        : tone === "warning"
          ? "ring-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
          : tone === "success"
            ? "ring-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]"
            : tone === "error"
              ? "ring-[var(--color-error)]/30 bg-[var(--color-error-light)] text-[var(--color-error)]"
              : "ring-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]";
    return (
      <div className={cn("flex flex-col rounded-lg px-3 py-2 ring-1", toneCls, className)}>
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest opacity-90">
          {icon}
          {label}
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-1">
          {textValue ? (
            <span className="truncate text-[12.5px] font-semibold leading-tight text-[var(--color-text-1)]" title={textValue}>
              {textValue}
            </span>
          ) : animateValue ? (
            <CountUp value={value} showDeltaColor className="text-[18px] font-bold text-[var(--color-text-1)]" />
          ) : (
            <span className="text-[18px] font-bold tabular-nums text-[var(--color-text-1)]">{value}</span>
          )}
          {hint ? (
            <span className="truncate text-[10px] opacity-80" title={hint}>
              {hint}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title ?? `${value} de ${label.toLowerCase()}`}
      className={cn(
        "tickets-kpi-pill",
        pulse && "tickets-kpi-pill--pulse",
        compact && "tickets-kpi-pill--compact",
        onClick && "cursor-pointer transition-opacity hover:opacity-90",
        className,
      )}
      style={toneVar ? { ["--pill-tone" as string]: toneVar } : undefined}
    >
      {icon ?? <span className="tickets-kpi-pill-dot" aria-hidden />}
      <span className="tickets-kpi-pill-value">
        {animateValue ? <CountUp value={value} showDeltaColor /> : value}
      </span>
      <span className="tickets-kpi-pill-label">{label}</span>
    </Tag>
  );
}
