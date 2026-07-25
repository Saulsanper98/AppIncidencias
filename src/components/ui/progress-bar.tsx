import { cn } from "@/lib/utils";

type ProgressBarProps = {
  /** 0–100 */
  value: number;
  tone?: "accent" | "success" | "warning" | "error";
  className?: string;
  trackClassName?: string;
  /** Altura en px (default 6). */
  height?: number;
  animated?: boolean;
};

const TONE_FILL: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  accent: "bg-[var(--color-accent)]",
  success: "bg-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]",
  error: "bg-[var(--color-error)]",
};

/** Barra de progreso con transición width (Ola 4 #531). */
export function ProgressBar({
  value,
  tone = "accent",
  className,
  trackClassName,
  height = 6,
  animated = true,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]",
        trackClassName,
      )}
      style={{ height }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full",
          TONE_FILL[tone],
          animated && "ccmgc-bar-fill",
        )}
        style={{ ["--bar-width" as string]: `${clamped}%`, width: `${clamped}%` }}
      />
    </div>
  );
}
