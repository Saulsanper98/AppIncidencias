"use client";

import {
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import {
  ChartGrid,
  ChartShell,
  ChartTooltip,
} from "@/components/dashboard-builder/chart-primitives";
import { useChartAnimationProps } from "@/hooks/use-chart-motion";
import { CHART_THEME } from "@/lib/dashboard/chart-theme";
import { colorWithAlpha } from "@/lib/dashboard/chart-palette";
import { buildScatterSeries, formatScatterCategoryTick } from "@/lib/dashboard/widget-data-helpers";

import type { ChartWidgetModel } from "./types";

type ChartWidgetProps = {
  model: ChartWidgetModel;
};

function scatterXDomain(pointCount: number): [number, number] {
  if (pointCount <= 1) return [-0.5, 0.5];
  return [-0.5, pointCount - 0.5];
}

type ScatterPointPayload = { fill?: string; name?: string; z?: number };

function renderScatterPointShape(accentColor: string, bubble = false) {
  return (props: { cx?: number; cy?: number; payload?: ScatterPointPayload }) => {
    const { cx, cy, payload } = props ?? {};
    if (cx == null || cy == null) return null;
    const fill = payload?.fill ?? accentColor;
    const innerR = bubble
      ? Math.min(12, Math.max(4, Math.sqrt(Math.abs(Number(payload?.z ?? 1))) * 1.8))
      : 5;
    const outerR = bubble ? innerR + 5 : 9;

    return (
      <g className="dashboard-scatter-point" aria-label={payload?.name}>
        <circle cx={cx} cy={cy} r={outerR} fill={colorWithAlpha(fill, 0.16)} />
        <circle cx={cx} cy={cy} r={innerR} fill={fill} stroke="var(--color-surface)" strokeWidth={2} />
      </g>
    );
  };
}

export function ScatterChartWidget({ model }: ChartWidgetProps) {
  const animationProps = useChartAnimationProps();
  const {
    widget,
    responsiveChartHeight,
    accentColor,
    sourceData,
    showGrid,
    chartMargin,
    tickBySize,
    formatTick,
    yDomain,
    executiveTooltipContent,
    compactLegend,
    entryColors,
    xAxisInterval,
    xAxisAngle,
  } = model;

  const scatterData = buildScatterSeries(sourceData, entryColors);
  const xDomain = scatterXDomain(scatterData.length);

  return (
    <ChartShell height={responsiveChartHeight} accentColor={accentColor} ariaLabel={widget.title}>
      <ResponsiveContainer width="100%" height={responsiveChartHeight}>
        <ScatterChart margin={chartMargin}>
          <ChartGrid show={showGrid} />
          <XAxis
            dataKey="xIndex"
            type="number"
            name="categoría"
            domain={xDomain}
            ticks={scatterData.map((point) => point.xIndex)}
            tickFormatter={(value) => formatScatterCategoryTick(sourceData, Number(value))}
            interval={xAxisInterval === "preserveStartEnd" ? "preserveStartEnd" : xAxisInterval}
            angle={xAxisAngle}
            tick={tickBySize}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            dataKey="y"
            type="number"
            name="valor"
            domain={yDomain}
            tick={tickBySize}
            tickFormatter={formatTick}
            axisLine={false}
            tickLine={false}
          />
          <ChartTooltip content={executiveTooltipContent} />
          {compactLegend}
          <Scatter
            data={scatterData}
            fillOpacity={0.92}
            {...animationProps}
            shape={renderScatterPointShape(accentColor)}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function BubbleChartWidget({ model }: ChartWidgetProps) {
  const animationProps = useChartAnimationProps();
  const {
    widget,
    responsiveChartHeight,
    accentColor,
    sourceData,
    showGrid,
    chartMargin,
    tickBySize,
    formatTick,
    yDomain,
    executiveTooltipContent,
    compactLegend,
    entryColors,
    xAxisInterval,
    xAxisAngle,
  } = model;

  const bubbleData = buildScatterSeries(sourceData, entryColors);
  const xDomain = scatterXDomain(bubbleData.length);

  return (
    <ChartShell height={responsiveChartHeight} accentColor={accentColor} ariaLabel={widget.title}>
      <ResponsiveContainer width="100%" height={responsiveChartHeight}>
        <ScatterChart margin={chartMargin}>
          <ChartGrid show={showGrid} />
          <XAxis
            dataKey="xIndex"
            type="number"
            domain={xDomain}
            ticks={bubbleData.map((point) => point.xIndex)}
            tickFormatter={(value) => formatScatterCategoryTick(sourceData, Number(value))}
            interval={xAxisInterval === "preserveStartEnd" ? "preserveStartEnd" : xAxisInterval}
            angle={xAxisAngle}
            tick={tickBySize}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            dataKey="y"
            type="number"
            domain={yDomain}
            tick={tickBySize}
            tickFormatter={formatTick}
            axisLine={false}
            tickLine={false}
          />
          <ZAxis dataKey="z" range={[40, 280]} />
          <ChartTooltip content={executiveTooltipContent} />
          {compactLegend}
          <Scatter
            data={bubbleData}
            fillOpacity={0.82}
            {...animationProps}
            shape={renderScatterPointShape(accentColor, true)}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
