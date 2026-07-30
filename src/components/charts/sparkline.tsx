"use client";

import { useId, useMemo } from "react";

import { colorWithAlpha } from "@/lib/dashboard/chart-palette";
import { cn } from "@/lib/utils";

export type SparklineVariant = "mini" | "hero";

export type SparklineProps = {
  values: readonly number[];
  variant?: SparklineVariant;
  accentColor?: string;
  highlightIndex?: number;
  height?: number;
  className?: string;
};

function buildSparkPath(
  values: readonly number[],
  width: number,
  height: number,
  pad: number,
  smooth: boolean,
): { linePath: string; areaPath: string; coords: { x: number; y: number }[] } {
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);

  const coords = values.map((value, index) => {
    const x = pad + (index / Math.max(values.length - 1, 1)) * innerW;
    const y = pad + innerH - ((value - min) / span) * innerH;
    return { x, y };
  });

  if (!smooth || coords.length < 3) {
    const linePath = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("");
    const areaPath = `${linePath} L${coords[coords.length - 1]?.x.toFixed(1)},${height - pad} L${coords[0]?.x.toFixed(1)},${height - pad} Z`;
    return { linePath, areaPath, coords };
  }

  const linePath =
    `M ${coords[0]!.x.toFixed(1)},${coords[0]!.y.toFixed(1)} ` +
    coords
      .slice(1)
      .map((point, index) => {
        const prev = coords[index]!;
        const mx = (prev.x + point.x) / 2;
        return `Q ${prev.x.toFixed(1)},${prev.y.toFixed(1)} ${mx.toFixed(1)},${((prev.y + point.y) / 2).toFixed(1)} T ${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      })
      .join(" ");

  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  return { linePath, areaPath, coords };
}

/** Sparkline SVG unificado (tooltips ejecutivos + hero admin). */
export function Sparkline({
  values,
  variant = "mini",
  accentColor = "var(--color-accent)",
  highlightIndex,
  height: heightProp,
  className,
}: SparklineProps) {
  const gradientId = useId().replace(/:/g, "");

  const config = useMemo(() => {
    if (variant === "hero") {
      const height = heightProp ?? 56;
      return { width: 800, height, pad: 4, smooth: true, responsive: true };
    }
    return { width: 112, height: heightProp ?? 28, pad: 4, smooth: false, responsive: false };
  }, [variant, heightProp]);

  if (values.length < 2) return null;

  const hi = Math.max(0, Math.min(highlightIndex ?? values.length - 1, values.length - 1));
  const { linePath, areaPath, coords } = buildSparkPath(values, config.width, config.height, config.pad, config.smooth);
  const highlight = coords[hi] ?? coords[0]!;

  const svgProps = config.responsive
    ? { viewBox: `0 0 ${config.width} ${config.height}`, preserveAspectRatio: "none" as const, className: cn("analytics-sparkline h-14 w-full", className) }
    : { width: config.width, height: config.height, className: cn("dashboard-sparkline overflow-visible", className) };

  return (
    <svg {...svgProps} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity={0.35} />
          <stop offset="100%" stopColor={accentColor} stopOpacity={variant === "hero" ? 0 : 0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={variant === "hero" ? accentColor : colorWithAlpha(accentColor, 0.55)}
        strokeWidth={variant === "hero" ? 2 : 1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={highlight.x}
        cy={highlight.y}
        r={variant === "hero" ? 4 : 4}
        fill={accentColor}
        stroke="var(--color-surface)"
        strokeWidth={1.75}
      />
    </svg>
  );
}

/** Alias compacto para tooltips ejecutivos. */
export function MiniSparkline(props: Omit<SparklineProps, "variant">) {
  return <Sparkline {...props} variant="mini" className={cn("dashboard-executive-tooltip__sparkline mt-1.5", props.className)} />;
}
