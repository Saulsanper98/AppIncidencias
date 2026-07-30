"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { CartesianGrid, Brush, Label, Legend, Sector, Tooltip, XAxis, YAxis } from "recharts";

import {
  CHART_ANIMATION_PROPS,
  CHART_THEME,
  getCartesianMargin,
  type MetricFormat,
} from "@/lib/dashboard/chart-theme";
import { colorWithAlpha } from "@/lib/dashboard/chart-palette";
import { useBrushAnimationProps } from "@/hooks/use-chart-motion";
import { cn } from "@/lib/utils";

type TickStyle = { fill?: string; fontSize?: number; fontWeight?: number };

type LegendEntry = { value?: string | number; color?: string };

type ChartDensityContextValue = { isHighDensity: boolean };

const ChartDensityContext = createContext<ChartDensityContextValue>({ isHighDensity: false });

export function ChartDensityProvider({
  isHighDensity,
  children,
}: {
  isHighDensity: boolean;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ isHighDensity }), [isHighDensity]);
  return <ChartDensityContext.Provider value={value}>{children}</ChartDensityContext.Provider>;
}

export function useChartDensity() {
  return useContext(ChartDensityContext);
}

export function ChartShell({
  height,
  accentColor,
  children,
  className,
  ariaLabel,
  highDensity: highDensityProp,
  footer,
}: {
  height: number;
  accentColor: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  highDensity?: boolean;
  footer?: ReactNode;
}) {
  const { isHighDensity: isHighDensityCtx } = useChartDensity();
  const isHighDensity = highDensityProp ?? isHighDensityCtx;

  return (
    <div
      className={cn(
        "dashboard-chart-shell app-chart-shell",
        isHighDensity && "dashboard-chart-shell--dense",
        className,
      )}
      style={{ width: "100%", height, ["--chart-accent" as string]: accentColor }}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
    >
      {children}
      {footer}
    </div>
  );
}

export function ChartGradientDefs({
  idPrefix,
  colors,
}: {
  idPrefix: string;
  colors: readonly string[];
}) {
  return (
    <defs>
      {colors.map((color, index) => (
        <linearGradient key={`${idPrefix}-${index}`} id={`${idPrefix}-fill-${index}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={CHART_THEME.area.fillOpacityTop} />
          <stop offset="88%" stopColor={color} stopOpacity={0.08} />
          <stop offset="100%" stopColor={color} stopOpacity={CHART_THEME.area.fillOpacityBottom} />
        </linearGradient>
      ))}
      {colors.slice(0, 1).map((color) => (
        <linearGradient key={`${idPrefix}-stroke`} id={`${idPrefix}-stroke`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={colorWithAlpha(color, 0.65)} />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
      ))}
    </defs>
  );
}

export function ChartGrid({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <CartesianGrid
      strokeDasharray={CHART_THEME.grid.dash}
      stroke={CHART_THEME.grid.stroke}
      vertical={false}
    />
  );
}

export function ChartXAxis({
  dataKey,
  tick,
  interval = "preserveStartEnd",
  angle = 0,
  isSmall = false,
  tickFormatter,
}: {
  dataKey: string;
  tick: TickStyle;
  interval?: number | "preserveStartEnd";
  angle?: number;
  isSmall?: boolean;
  tickFormatter?: (value: string | number) => string;
}) {
  return (
    <XAxis
      dataKey={dataKey}
      tick={tick}
      axisLine={false}
      tickLine={false}
      dy={angle !== 0 ? 2 : 4}
      interval={interval}
      minTickGap={isSmall ? 10 : 14}
      angle={angle}
      textAnchor={angle !== 0 ? "end" : "middle"}
      height={angle !== 0 ? 52 : 30}
      tickFormatter={tickFormatter}
    />
  );
}

export function ChartYAxis({
  tick,
  formatTick,
  domain,
  width = 42,
}: {
  tick: TickStyle;
  formatTick: (value: number | string) => string;
  domain?: [number, number];
  width?: number;
}) {
  return (
    <YAxis
      tick={tick}
      tickFormatter={formatTick}
      axisLine={false}
      tickLine={false}
      width={width}
      domain={domain}
      dx={-2}
    />
  );
}

export function ChartTooltip({
  content,
  cursor = CHART_THEME.cursor,
  shared,
}: {
  content: (props: unknown) => ReactNode | null;
  cursor?: boolean | Record<string, string | number | undefined>;
  shared?: boolean;
}) {
  return (
    <Tooltip
      content={content}
      cursor={cursor}
      shared={shared}
      isAnimationActive={false}
      animationDuration={0}
      offset={10}
      /* Mantener el popup dentro del area del chart (evita recorte en bordes). */
      allowEscapeViewBox={{ x: false, y: false }}
      reverseDirection={{ x: false, y: false }}
      contentStyle={CHART_THEME.tooltip.contentStyle}
      labelStyle={CHART_THEME.tooltip.labelStyle}
      wrapperClassName="dashboard-chart-tooltip-wrap"
      wrapperStyle={{ pointerEvents: "auto", outline: "none", zIndex: 40 }}
    />
  );
}

export function DonutCenterMetric({
  total,
  formatTotal,
  subtitle = "Total",
  segmentCount = 0,
}: {
  total: number;
  formatTotal: (value: number) => string;
  subtitle?: string;
  segmentCount?: number;
}) {
  const enterDelayMs = segmentCount * 60;
  return (
    <Label
      content={({ viewBox }) => {
        if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
        const { cx, cy } = viewBox as { cx: number; cy: number };
        return (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="dashboard-donut-center">
            <tspan
              x={cx}
              y={cy - 5}
              fill="var(--color-text-1)"
              fontSize={15}
              fontWeight={700}
              className="dashboard-donut-center__value"
              style={{ animationDelay: `${enterDelayMs}ms` }}
            >
              {formatTotal(total)}
            </tspan>
            <tspan
              x={cx}
              y={cy + 13}
              fill="var(--color-text-3)"
              fontSize={9}
              fontWeight={600}
              letterSpacing="0.06em"
              className="dashboard-donut-center__label"
              style={{ animationDelay: `${enterDelayMs + 40}ms` }}
            >
              {subtitle.toUpperCase()}
            </tspan>
          </text>
        );
      }}
      position="center"
    />
  );
}

export function renderActivePieSector(props: unknown) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props as {
    cx: number;
    cy: number;
    innerRadius: number;
    outerRadius: number;
    startAngle: number;
    endAngle: number;
    fill: string;
  };
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke="var(--color-surface)"
      strokeWidth={3}
      className="dashboard-pie-sector--active"
    />
  );
}

export { CHART_ANIMATION_PROPS };

type BrushTravellerProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

function ChartBrushTraveller({ x = 0, y = 0, width = 10, height = 28, accentColor }: BrushTravellerProps & { accentColor: string }) {
  const pillW = Math.min(Math.max(width, 8), 12);
  const insetY = 4;
  const pillH = Math.max(height - insetY * 2, 12);
  const pillX = x + (width - pillW) / 2;
  const pillY = y + insetY;

  return (
    <g className="dashboard-chart-brush-traveller" aria-hidden>
      <rect
        x={pillX}
        y={pillY}
        width={pillW}
        height={pillH}
        rx={pillW / 2}
        fill={colorWithAlpha(accentColor, 0.95)}
        stroke="none"
      />
      <rect
        x={pillX + pillW / 2 - 0.75}
        y={pillY + pillH * 0.28}
        width={1.5}
        height={pillH * 0.44}
        rx={0.75}
        fill={colorWithAlpha("#ffffff", 0.45)}
      />
    </g>
  );
}

export function ChartBrush({
  dataKey,
  accentColor,
  isSmall = false,
  startIndex,
  endIndex,
}: {
  dataKey: string;
  accentColor: string;
  isSmall?: boolean;
  startIndex?: number;
  endIndex?: number;
}) {
  const brushAnimation = useBrushAnimationProps();
  const travellerRenderer = useMemo(
    () =>
      function BrushTraveller(props: BrushTravellerProps) {
        return <ChartBrushTraveller {...props} accentColor={accentColor} />;
      },
    [accentColor],
  );

  return (
    <Brush
      dataKey={dataKey}
      height={isSmall ? 28 : 32}
      stroke="transparent"
      fill="transparent"
      traveller={travellerRenderer}
      travellerWidth={isSmall ? 10 : 12}
      padding={{ top: 4, right: 2, bottom: 4, left: 2 }}
      tickFormatter={() => ""}
      className="dashboard-chart-brush"
      startIndex={startIndex}
      endIndex={endIndex}
      {...brushAnimation}
    />
  );
}

/** Microcopy opcional cuando el brush temporal está activo. */
export function ChartBrushHint({ className }: { className?: string }) {
  return (
    <p className={cn("dashboard-chart-brush-hint", className)} aria-hidden>
      Arrastra los extremos para acotar el periodo
    </p>
  );
}

export function ChartLegend({
  payload,
  isSmallWidget,
  paddingTop = "6px",
  ultraCompact = false,
}: {
  payload: ReadonlyArray<LegendEntry> | undefined;
  isSmallWidget: boolean;
  paddingTop?: string;
  ultraCompact?: boolean;
}) {
  if (!payload?.length) return null;
  return (
    <Legend
      {...({ payload } as Record<string, unknown>)}
      align="left"
      verticalAlign="bottom"
      height={ultraCompact ? 28 : isSmallWidget ? 38 : 28}
      wrapperStyle={{ left: 4, right: 4, width: "calc(100% - 8px)" }}
      content={() => (
        <div
          className={cn(
            "dashboard-chart-legend",
            (isSmallWidget || ultraCompact) && "dashboard-chart-legend--compact",
            ultraCompact && "dashboard-chart-legend--ultra",
          )}
          style={{ paddingTop }}
        >
          {payload.map((item, index) => (
            <span
              key={`${String(item.value ?? "")}-${index}`}
              className="dashboard-chart-legend__item"
              style={{ ["--legend-index" as string]: index }}
            >
              <span className="dashboard-chart-legend__dot" style={{ backgroundColor: item.color ?? "var(--color-text-3)" }} />
              <span className="dashboard-chart-legend__label">{String(item.value ?? "")}</span>
            </span>
          ))}
        </div>
      )}
    />
  );
}

export function getActiveDotRenderer(color: string) {
  return function ActiveDot(props: { cx?: number; cy?: number }) {
    const { cx, cy } = props ?? {};
    if (cx == null || cy == null) return null;
    return (
      <g>
        <circle cx={cx} cy={cy} r={8} fill={colorWithAlpha(color, 0.18)} />
        <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
      </g>
    );
  };
}

export function getSeriesDotRenderer(color: string) {
  return function SeriesDot(props: { cx?: number; cy?: number }) {
    const { cx, cy } = props ?? {};
    if (cx == null || cy == null) return null;
    return <circle cx={cx} cy={cy} r={3} fill={color} stroke={colorWithAlpha(color, 0.35)} strokeWidth={3} />;
  };
}

export function getCategoryDotRenderer(colors: readonly string[]) {
  return function CategoryDot(props: { cx?: number; cy?: number; index?: number }) {
    const { cx, cy, index } = props ?? {};
    if (cx == null || cy == null) return null;
    const color = colors[(index ?? 0) % colors.length] ?? colors[0] ?? "#2563EB";
    return getSeriesDotRenderer(color)({ cx, cy });
  };
}

export function getChartMargin(isSmallWidget: boolean, highDensity = false) {
  return getCartesianMargin(isSmallWidget, highDensity);
}

export type { MetricFormat, TickStyle, LegendEntry };
