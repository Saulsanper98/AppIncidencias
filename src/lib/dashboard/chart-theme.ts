export type MetricFormat = "number" | "compact" | "percent" | "integer";

export function formatMetric(value: number | string, format: MetricFormat, digits = 1) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  if (format === "integer") return String(Math.round(numeric));
  if (format === "percent") return `${numeric.toFixed(0)}%`;
  if (format === "compact") {
    return new Intl.NumberFormat("es-ES", {
      notation: "compact",
      maximumFractionDigits: digits,
    }).format(numeric);
  }

  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: digits,
  }).format(numeric);
}

export const CHART_THEME = {
  grid: {
    stroke: "rgba(148,163,184,0.06)",
    dash: "4 6",
  },
  axisTick: {
    fill: "var(--color-text-3)",
    fontSize: 11,
    fontWeight: 500,
  },
  axisTickSmall: {
    fill: "var(--color-text-3)",
    fontSize: 10,
    fontWeight: 500,
  },
  cursor: {
    stroke: "rgba(148,163,184,0.35)",
    strokeWidth: 1,
    strokeDasharray: "4 4",
    fill: "color-mix(in oklab, var(--chart-accent, var(--color-accent)) 7%, transparent)",
  },
  animation: {
    duration: 520,
    easing: "ease-out" as const,
    /** Retraso escalonado entre series (ms). */
    stagger: 60,
  },
  bar: {
    radius: [7, 7, 0, 0] as [number, number, number, number],
    radiusHorizontal: [0, 7, 7, 0] as [number, number, number, number],
    radiusStackTop: [7, 7, 0, 0] as [number, number, number, number],
    maxSize: 48,
    background: "rgba(148,163,184,0.055)",
  },
  line: {
    strokeWidth: 2.25,
    maStrokeWidth: 1.35,
    maDash: "5 5",
  },
  area: {
    strokeWidth: 2,
    fillOpacityTop: 0.42,
    fillOpacityBottom: 0.02,
  },
  pie: {
    paddingAngle: 2.5,
    strokeWidth: 2,
  },
  tooltip: {
    contentStyle: {
      background: "transparent",
      border: "none",
      borderRadius: "0",
      padding: 0,
      boxShadow: "none",
    },
    labelStyle: { color: "var(--color-text-1)" },
  },
} as const;

export function getCartesianMargin(isSmall: boolean, highDensity = false) {
  if (highDensity) {
    return {
      top: 4,
      right: 4,
      left: -22,
      bottom: 0,
    };
  }
  return {
    top: 10,
    right: isSmall ? 8 : 14,
    left: isSmall ? -18 : -16,
    bottom: 0,
  };
}

export function getCartesianMarginWithBrush(isSmall: boolean, highDensity = false) {
  return {
    ...getCartesianMargin(isSmall, highDensity),
    bottom: highDensity ? (isSmall ? 28 : 30) : isSmall ? 34 : 38,
  };
}

export function getVerticalBarMargin(isSmall: boolean, highDensity = false) {
  if (highDensity) {
    return {
      top: 4,
      right: 8,
      left: isSmall ? 44 : 48,
      bottom: 2,
    };
  }
  return {
    top: 6,
    right: isSmall ? 12 : 18,
    left: isSmall ? 52 : 58,
    bottom: 4,
  };
}

export function getYDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-9);
  const floor = min >= 0 ? Math.max(0, min - span * 0.12) : min - span * 0.08;
  const ceil = max + span * 0.18;
  return [floor, ceil];
}

/** Espaciado inteligente de etiquetas del eje X según densidad de puntos. */
export function getXAxisInterval(pointCount: number, isSmall: boolean): number | "preserveStartEnd" {
  if (pointCount <= 8) return 0;
  if (pointCount <= 16) return isSmall ? 1 : 0;
  if (pointCount <= 31) return isSmall ? 2 : 1;
  if (pointCount <= 60) return isSmall ? 4 : 2;
  return isSmall ? 6 : 3;
}

export function getXAxisLabelAngle(pointCount: number, isSmall: boolean): number {
  if (pointCount > 24) return isSmall ? -42 : -34;
  if (pointCount > 14) return isSmall ? -36 : -28;
  return 0;
}

export const CHART_ANIMATION_PROPS = {
  isAnimationActive: true,
  animationDuration: CHART_THEME.animation.duration,
  animationEasing: CHART_THEME.animation.easing,
} as const;

export const CHART_ANIMATION_DISABLED = {
  isAnimationActive: false,
  animationDuration: 0,
} as const;

export type ChartAnimationProps = typeof CHART_ANIMATION_PROPS | typeof CHART_ANIMATION_DISABLED;

export function getChartAnimationProps(prefersReducedMotion: boolean): ChartAnimationProps {
  return prefersReducedMotion ? CHART_ANIMATION_DISABLED : CHART_ANIMATION_PROPS;
}

/** Props con retardo escalonado para series múltiples (p. ej. área dual). */
export function getStaggeredAnimationProps(prefersReducedMotion: boolean, seriesIndex: number) {
  if (prefersReducedMotion) return CHART_ANIMATION_DISABLED;
  return {
    isAnimationActive: true as const,
    animationDuration: CHART_THEME.animation.duration,
    animationEasing: CHART_THEME.animation.easing,
    animationBegin: seriesIndex * CHART_THEME.animation.stagger,
  };
}

/** Brush entra tras la serie principal (retardo ~55 % de duración base). */
export function getTooltipAnimationProps(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) return CHART_ANIMATION_DISABLED;
  return {
    isAnimationActive: true as const,
    animationDuration: 140,
    animationEasing: CHART_THEME.animation.easing,
  };
}

export function getBrushAnimationProps(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) return CHART_ANIMATION_DISABLED;
  return {
    isAnimationActive: true as const,
    animationDuration: 380,
    animationEasing: CHART_THEME.animation.easing,
    animationBegin: Math.round(CHART_THEME.animation.duration * 0.55),
  };
}

/** Ángulos de un sector para pie/rose con stagger (un `<Pie>` por sector). */
export function getPieSliceAngles(
  values: readonly number[],
  index: number,
  gapDeg: number = CHART_THEME.pie.paddingAngle,
): { startAngle: number; endAngle: number } {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return { startAngle: 0, endAngle: 0 };

  const gaps = gapDeg * values.length;
  const available = 360 - gaps;
  let cursor = 0;

  for (let i = 0; i < index; i += 1) {
    cursor += (Math.max(0, values[i] ?? 0) / total) * available + gapDeg;
  }

  const span = (Math.max(0, values[index] ?? 0) / total) * available;
  return { startAngle: cursor, endAngle: cursor + span };
}

/** Radio exterior variable para rose (sector proporcional al valor). */
export function getRoseSliceOuterRadius(baseOuter: number, value: number, maxValue: number): number {
  if (maxValue <= 0) return baseOuter;
  return Math.round(baseOuter * (0.38 + 0.62 * (Math.max(0, value) / maxValue)));
}

export function getBarBackgroundProps() {
  return { fill: CHART_THEME.bar.background };
}

export function getBarActiveProps(color?: string) {
  return {
    fill: color,
    stroke: "var(--color-surface)",
    strokeWidth: 1.5,
    opacity: 1,
    style: { filter: "brightness(1.08)" },
  };
}

/** Muestra brush cuando hay suficientes puntos para navegar el periodo. */
export function shouldShowChartBrush(pointCount: number): boolean {
  return pointCount > 16;
}

/** Ventana inicial del brush: en series largas (p. ej. 90d) enfoca los últimos 30 días. */
export function getBrushDefaultRange(pointCount: number): { startIndex?: number; endIndex?: number } {
  if (pointCount <= 16) return {};
  if (pointCount > 30) {
    return { startIndex: pointCount - 30, endIndex: pointCount - 1 };
  }
  return { startIndex: 0, endIndex: pointCount - 1 };
}
