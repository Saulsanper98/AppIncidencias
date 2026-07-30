"use client";

import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import {
  ChartBrush,
  ChartBrushHint,
  ChartGradientDefs,
  ChartGrid,
  ChartLegend,
  ChartShell,
  ChartTooltip,
  ChartXAxis,
  ChartYAxis,
  getActiveDotRenderer,
  type LegendEntry,
} from "@/components/dashboard-builder/chart-primitives";
import { createExecutiveTooltipContent } from "@/components/dashboard-builder/charts/executive-tooltip";
import { useStaggeredChartAnimation } from "@/hooks/use-chart-motion";
import {
  CHART_THEME,
  formatMetric,
  getBrushDefaultRange,
  getCartesianMargin,
  getCartesianMarginWithBrush,
  getXAxisInterval,
  getXAxisLabelAngle,
  getYDomain,
  shouldShowChartBrush,
  type MetricFormat,
} from "@/lib/dashboard/chart-theme";
import { buildNumericValues } from "@/lib/dashboard/widget-data-helpers";
import { cn } from "@/lib/utils";

export type DualSeriesKey = {
  dataKey: string;
  name: string;
  color: string;
};

export type DualTimeSeriesRow = Record<string, string | number>;

export type DualTimeSeriesAreaChartProps = {
  data: DualTimeSeriesRow[];
  xKey: string;
  series: DualSeriesKey[];
  accentColor: string;
  dataSource: string;
  idPrefix: string;
  height: number | `${number}%`;
  showBrush?: boolean;
  isSmall?: boolean;
  highDensity?: boolean;
  smoothLines?: boolean;
  metricFormat?: MetricFormat;
  showLegend?: boolean;
  showGrid?: boolean;
  xTickFormatter?: (value: string) => string;
};

export function DualTimeSeriesAreaChart({
  data,
  xKey,
  series,
  accentColor,
  dataSource,
  idPrefix,
  height,
  showBrush: showBrushProp,
  isSmall = false,
  highDensity = false,
  smoothLines = true,
  metricFormat = "integer",
  showLegend = true,
  showGrid = true,
  xTickFormatter,
}: DualTimeSeriesAreaChartProps) {
  const staggerAnimation = useStaggeredChartAnimation();
  const pointCount = data.length;
  const brushEnabled = showBrushProp ?? shouldShowChartBrush(pointCount);
  const isCompact = isSmall || highDensity;
  const margin = brushEnabled ? getCartesianMarginWithBrush(isSmall, highDensity) : getCartesianMargin(isSmall, highDensity);
  const xInterval = getXAxisInterval(pointCount, isCompact);
  const xAngle = getXAxisLabelAngle(pointCount, isCompact);
  const brushRange = brushEnabled ? getBrushDefaultRange(pointCount) : {};

  const numericValues = useMemo(() => buildNumericValues(data, dataSource), [data, dataSource]);

  const yDomain = useMemo(() => {
    const allValues = data.flatMap((row) =>
      series.map((s) => {
        const raw = row[s.dataKey];
        return typeof raw === "number" ? raw : Number(raw ?? 0);
      }),
    );
    return getYDomain(allValues);
  }, [data, series]);

  const tooltip = useMemo(
    () =>
      createExecutiveTooltipContent({
        accentColor,
        metricFormat,
        numericValues,
        sourceData: data,
        dataSource,
      }),
    [accentColor, metricFormat, numericValues, data, dataSource],
  );

  const legendPayload = useMemo((): LegendEntry[] | undefined => {
    if (!showLegend) return undefined;
    return series.map((s) => ({ value: s.name, color: s.color }));
  }, [showLegend, series]);

  const formatTick = (value: number | string) => formatMetric(value, metricFormat);
  const tickStyle = isCompact ? CHART_THEME.axisTickSmall : CHART_THEME.axisTick;

  const chartBody = (
    <AreaChart data={data} margin={margin}>
      <ChartGradientDefs idPrefix={idPrefix} colors={series.map((s) => s.color)} />
      <ChartGrid show={showGrid} />
      <ChartXAxis
        dataKey={xKey}
        tick={tickStyle}
        interval={xInterval}
        angle={xAngle}
        isSmall={isSmall}
        tickFormatter={xTickFormatter ? (value) => xTickFormatter(String(value)) : undefined}
      />
      <ChartYAxis tick={tickStyle} formatTick={formatTick} domain={yDomain} />
      <ChartTooltip content={tooltip} />
      {legendPayload ? (
        <ChartLegend
          payload={legendPayload}
          isSmallWidget={isCompact}
          ultraCompact={highDensity}
          paddingTop={highDensity ? "2px" : "8px"}
        />
      ) : null}
      {series.map((item, index) => (
        <Area
          key={item.dataKey}
          type={smoothLines ? "monotone" : "linear"}
          dataKey={item.dataKey}
          name={item.name}
          stroke={item.color}
          fill={`url(#${idPrefix}-fill-${index})`}
          fillOpacity={1}
          strokeWidth={CHART_THEME.area.strokeWidth}
          dot={false}
          activeDot={getActiveDotRenderer(item.color)}
          connectNulls
          {...staggerAnimation(index)}
        />
      ))}
      {brushEnabled ? (
        <ChartBrush
          dataKey={xKey}
          accentColor={accentColor}
          isSmall={isSmall || highDensity}
          startIndex={brushRange.startIndex}
          endIndex={brushRange.endIndex}
        />
      ) : null}
    </AreaChart>
  );

  if (typeof height === "number") {
    return (
      <ChartShell
        height={height}
        accentColor={accentColor}
        highDensity={highDensity}
        className={brushEnabled ? "dashboard-chart-shell--with-brush-hint" : undefined}
      >
        <ResponsiveContainer width="100%" height={height}>
          {chartBody}
        </ResponsiveContainer>
        {brushEnabled ? <ChartBrushHint /> : null}
      </ChartShell>
    );
  }

  return (
    <div
      className={cn(
        "dashboard-chart-shell app-chart-shell h-full w-full",
        highDensity && "dashboard-chart-shell--dense",
        brushEnabled && "dashboard-chart-shell--with-brush-hint",
      )}
      style={{ ["--chart-accent" as string]: accentColor }}
    >
      <ResponsiveContainer width="100%" height={height}>
        {chartBody}
      </ResponsiveContainer>
      {brushEnabled ? <ChartBrushHint /> : null}
    </div>
  );
}
