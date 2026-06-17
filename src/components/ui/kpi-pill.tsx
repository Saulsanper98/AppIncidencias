import { cn } from "@/lib/utils";

export type KpiTone = "neutral" | "info" | "accent" | "warning" | "success" | "error";

const TONE_VAR: Record<KpiTone, string | undefined> = {
  neutral: undefined,
  info: undefined,
  accent: "var(--color-accent)",
  warning: "var(--color-warning)",
  success: "var(--color-success)",
  error: "var(--color-error)",
};

type KpiPillProps = {
  label: string;
  value: number;
  tone?: KpiTone;
  icon?: React.ReactNode;
  pulse?: boolean;
  /** Variante compacta para filtros en barra de herramientas. */
  compact?: boolean;
  className?: string;
  onClick?: () => void;
  title?: string;
};

/**
 * Pill KPI unificada (hero, filtros, sidebar). Antes duplicada en
 * tickets-module y DesviosTable — una sola fuente de verdad visual.
 */
export function KpiPill({
  label,
  value,
  tone = "neutral",
  icon,
  pulse = false,
  compact = false,
  className,
  onClick,
  title,
}: KpiPillProps) {
  const toneVar = TONE_VAR[tone];
  const Tag = onClick ? "button" : "span";

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
      <span className="tickets-kpi-pill-value">{value}</span>
      <span className="tickets-kpi-pill-label">{label}</span>
    </Tag>
  );
}
