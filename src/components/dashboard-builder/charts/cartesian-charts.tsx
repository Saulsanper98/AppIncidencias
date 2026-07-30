"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartBrush,
  ChartBrushHint,
  ChartGradientDefs,
  ChartGrid,
  ChartShell,
  ChartTooltip,
  ChartXAxis,
  ChartYAxis,
  getActiveDotRenderer,
} from "@/components/dashboard-builder/chart-primitives";
import { useChartAnimationProps, useStaggeredChartAnimation } from "@/hooks/use-chart-motion";
import { useChartDrillNavigate } from "@/hooks/use-chart-drill-navigate";
import {
  CHART_THEME,
  getBarActiveProps,
  getBarBackgroundProps,
  getBrushDefaultRange,
  getVerticalBarMargin,
} from "@/lib/dashboard/chart-theme";
import { CHART_SERIES, getSlaComplianceSeries, getTicketsTrendSeries, isDenseOrdinalSeries } from "@/lib/dashboard/chart-palette";
import { getPrimarySeriesName, getBandejaDrillHref, isComparisonMultiSeriesSource, isMultiSeriesSource } from "@/lib/dashboard/widget-data-helpers";

import { DualTimeSeriesAreaChart } from "./dual-time-series-area-chart";
import type { ChartWidgetModel } from "./types";

type ChartWidgetProps = {
  model: ChartWidgetModel;
};

function axisProps(model: ChartWidgetModel, dataKey: string) {
  return {
    dataKey,
    tick: model.tickBySize,
    interval: model.xAxisInterval,
    angle: model.xAxisAngle,
    isSmall: model.isSmallWidget,
  };
}

type DualSeriesKey = { dataKey: string; name: string; color: string };

function getDualSeriesConfig(model: ChartWidgetModel): { keys: DualSeriesKey[]; xKey: string } | null {
  const { widget, palette, stackedLabels } = model;
  if (widget.dataSource === "tickets_trend") {
    const series = getTicketsTrendSeries();
    return {
      xKey: "day",
      keys: [
        { dataKey: series[0].dataKey, name: stackedLabels.serieA, color: series[0].color },
        { dataKey: series[1].dataKey, name: stackedLabels.serieB, color: series[1].color },
      ],
    };
  }
  if (widget.dataSource === "sla_compliance") {
    const series = getSlaComplianceSeries(
      palette[0] ?? CHART_SERIES.slaOk,
      palette[1] ?? CHART_SERIES.slaBreached,
    );
    return {
      xKey: "day",
      keys: [
        { dataKey: series[0].dataKey, name: stackedLabels.serieA, color: series[0].color },
        { dataKey: series[1].dataKey, name: stackedLabels.serieB, color: series[1].color },
      ],
    };
  }
  return null;
}

function ChartBrushLayer({
  model,
  xKey,
  pointCount,
}: {
  model: ChartWidgetModel;
  xKey: string;
  pointCount: number;
}) {
  if (!model.showChartBrush) return null;
  const range = getBrushDefaultRange(pointCount);
  return (
    <ChartBrush
      dataKey={xKey}
      accentColor={model.accentColor}
      isSmall={model.isSmallWidget || model.isHighDensity}
      startIndex={range.startIndex}
      endIndex={range.endIndex}
    />
  );
}

function chartBrushShellExtras(model: ChartWidgetModel) {
  if (!model.showChartBrush) return {};
  return {
    className: "dashboard-chart-shell--with-brush-hint",
    footer: <ChartBrushHint />,
  };
}

export function AreaChartWidget({ model }: ChartWidgetProps) {
  const animationProps = useChartAnimationProps();
  const {
    widget,
    responsiveChartHeight,
    accentColor,
    showGrid,
    smoothLines,
    sourceDataWithMaRef,
    chartIdPrefix,
    chartMargin,
    formatTick,
    yDomain,
    executiveTooltipContent,
    compactLegend,
    compactStackedLegend,
    renderColoredDot,
    activeDotRenderer,
    showMaRefOnCartesian,
  } = model;
  const dualConfig = getDualSeriesConfig(model);

  if (dualConfig && isMultiSeriesSource(widget.dataSource)) {
    return (
      <DualTimeSeriesAreaChart
        data={sourceDataWithMaRef}
        xKey={dualConfig.xKey}
        series={dualConfig.keys}
        accentColor={accentColor}
        dataSource={widget.dataSource}
        idPrefix={chartIdPrefix}
        height={responsiveChartHeight}
        showBrush={model.showChartBrush}
        isSmall={model.isSmallWidget}
        highDensity={model.isHighDensity}
        smoothLines={smoothLines}
        metricFormat={model.metricFormat}
        showLegend={model.showLegend}
        showGrid={showGrid}
      />
    );
  }

  const dataKey = widget.dataSource === "sla_compliance" ? "cumplido" : "value";
  const xKey = widget.dataSource === "sla_compliance" ? "day" : "name";
  const seriesName = getPrimarySeriesName(widget.dataSource, dataKey);
  const xProps = axisProps(model, xKey);

  return (
    <ChartShell height={responsiveChartHeight} accentColor={accentColor}>
      <ResponsiveContainer width="100%" height={responsiveChartHeight}>
        <AreaChart data={sourceDataWithMaRef} margin={chartMargin}>
          <ChartGradientDefs idPrefix={chartIdPrefix} colors={[accentColor]} />
          <ChartGrid show={showGrid} />
          <ChartXAxis {...xProps} />
          <ChartYAxis tick={model.tickBySize} formatTick={formatTick} domain={yDomain} />
          <ChartTooltip content={executiveTooltipContent} />
          {compactLegend}
          <Area
            type={smoothLines ? "monotone" : "linear"}
            dataKey={dataKey}
            name={seriesName}
            stroke={`url(#${chartIdPrefix}-stroke)`}
            fill={`url(#${chartIdPrefix}-fill-0)`}
            fillOpacity={1}
            strokeWidth={CHART_THEME.area.strokeWidth}
            dot={renderColoredDot}
            activeDot={activeDotRenderer}
            connectNulls
            {...animationProps}
          />
          {showMaRefOnCartesian ? (
            <Line
              type={smoothLines ? "monotone" : "linear"}
              dataKey="maRef"
              name="Media móvil"
              legendType="none"
              stroke="rgba(148,163,184,0.72)"
              strokeWidth={CHART_THEME.line.maStrokeWidth}
              strokeDasharray={CHART_THEME.line.maDash}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function BarChartWidget({ model }: ChartWidgetProps) {
  const animationProps = useChartAnimationProps();
  const staggerAnimation = useStaggeredChartAnimation();
  const { onSegmentClick } = useChartDrillNavigate(model.widget.dataSource);
  const {
    widget,
    responsiveChartHeight,
    accentColor,
    showGrid,
    sourceData,
    multiSeriesData,
    stackedLabels,
    palette,
    chartMargin,
    formatTick,
    yDomain,
    executiveTooltipContent,
    compactLegend,
    compactStackedLegend,
    entryColors,
  } = model;

  if (isComparisonMultiSeriesSource(widget.dataSource)) {
    const xProps = axisProps(model, "name");
    return (
      <ChartShell height={responsiveChartHeight} accentColor={accentColor} ariaLabel={`${widget.title}: comparativa por turno`}>
        <ResponsiveContainer width="100%" height={responsiveChartHeight}>
          <BarChart data={multiSeriesData} margin={chartMargin}>
            <ChartGrid show={showGrid} />
            <ChartXAxis {...xProps} />
            <ChartYAxis tick={model.tickBySize} formatTick={formatTick} />
            <ChartTooltip content={executiveTooltipContent} cursor={{ fill: CHART_THEME.bar.background }} />
            {compactStackedLegend}
            <Bar
              dataKey="serieA"
              name={stackedLabels.serieA}
              fill={palette[0]}
              radius={CHART_THEME.bar.radius}
              maxBarSize={CHART_THEME.bar.maxSize}
              background={getBarBackgroundProps()}
              activeBar={getBarActiveProps(palette[0])}
              cursor={getBandejaDrillHref(widget.dataSource, String(multiSeriesData[0]?.name ?? "")) ? "pointer" : undefined}
              onClick={onSegmentClick}
              {...staggerAnimation(0)}
            />
            <Bar
              dataKey="serieB"
              name={stackedLabels.serieB}
              fill={palette[1]}
              radius={CHART_THEME.bar.radius}
              maxBarSize={CHART_THEME.bar.maxSize}
              background={getBarBackgroundProps()}
              activeBar={getBarActiveProps(palette[1])}
              cursor={getBandejaDrillHref(widget.dataSource, String(multiSeriesData[0]?.name ?? "")) ? "pointer" : undefined}
              onClick={onSegmentClick}
              {...staggerAnimation(1)}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartShell>
    );
  }

  const dataKey = widget.dataSource === "sla_compliance" ? "cumplido" : "value";
  const xKey = widget.dataSource === "sla_compliance" ? "day" : "name";
  const xProps = axisProps(model, xKey);
  const denseBars = sourceData.length > 14;
  const monoSeries = isDenseOrdinalSeries(widget.dataSource);
  const drillEnabled = sourceData.some((row) => Boolean(getBandejaDrillHref(widget.dataSource, String(row.name ?? row.day ?? ""))));

  return (
    <ChartShell height={responsiveChartHeight} accentColor={accentColor} ariaLabel={widget.title}>
      <ResponsiveContainer width="100%" height={responsiveChartHeight}>
        <BarChart data={sourceData} margin={chartMargin} barCategoryGap={denseBars ? "12%" : "18%"}>
          <ChartGrid show={showGrid} />
          <ChartXAxis {...xProps} />
          <ChartYAxis tick={model.tickBySize} formatTick={formatTick} domain={yDomain} />
          <ChartTooltip content={executiveTooltipContent} cursor={{ fill: CHART_THEME.bar.background }} shared={false} />
          {compactLegend}
          <Bar
            dataKey={dataKey}
            name={getPrimarySeriesName(widget.dataSource, dataKey)}
            fill={monoSeries ? accentColor : undefined}
            radius={denseBars ? ([4, 4, 0, 0] as [number, number, number, number]) : CHART_THEME.bar.radius}
            maxBarSize={denseBars ? 22 : CHART_THEME.bar.maxSize}
            minPointSize={denseBars ? 3 : 2}
            background={getBarBackgroundProps()}
            activeBar={getBarActiveProps(accentColor)}
            cursor={drillEnabled ? "pointer" : undefined}
            onClick={onSegmentClick}
            {...animationProps}
          >
            {monoSeries
              ? null
              : sourceData.map((_, index) => (
                  <Cell key={index} fill={entryColors[index]} cursor={drillEnabled ? "pointer" : undefined} onClick={onSegmentClick} />
                ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function StackedBarChartWidget({ model }: ChartWidgetProps) {
  const staggerAnimation = useStaggeredChartAnimation();
  const {
    widget,
    responsiveChartHeight,
    accentColor,
    showGrid,
    multiSeriesData,
    activeStackedSeriesKeys,
    chartMargin,
    formatTick,
    executiveTooltipContent,
    compactStackedLegend,
    stackedLabels,
    palette,
  } = model;
  const xProps = axisProps(model, "name");
  const topStackKey = activeStackedSeriesKeys[activeStackedSeriesKeys.length - 1];

  return (
    <ChartShell
      height={responsiveChartHeight}
      accentColor={accentColor}
      ariaLabel={widget.title}
      {...chartBrushShellExtras(model)}
    >
      <ResponsiveContainer width="100%" height={responsiveChartHeight}>
        <BarChart data={multiSeriesData} margin={chartMargin}>
          <ChartGrid show={showGrid} />
          <ChartXAxis {...xProps} />
          <ChartYAxis tick={model.tickBySize} formatTick={formatTick} />
          <ChartTooltip content={executiveTooltipContent} cursor={{ fill: CHART_THEME.bar.background }} />
          {compactStackedLegend}
          {activeStackedSeriesKeys.includes("serieA") ? (
            <Bar
              dataKey="serieA"
              name={stackedLabels.serieA}
              stackId="total"
              fill={palette[0]}
              radius={topStackKey === "serieA" ? CHART_THEME.bar.radiusStackTop : [0, 0, 0, 0]}
              activeBar={getBarActiveProps(palette[0])}
              {...staggerAnimation(activeStackedSeriesKeys.indexOf("serieA"))}
            />
          ) : null}
          {activeStackedSeriesKeys.includes("serieB") ? (
            <Bar
              dataKey="serieB"
              name={stackedLabels.serieB}
              stackId="total"
              fill={palette[1]}
              radius={topStackKey === "serieB" ? CHART_THEME.bar.radiusStackTop : [0, 0, 0, 0]}
              activeBar={getBarActiveProps(palette[1])}
              {...staggerAnimation(activeStackedSeriesKeys.indexOf("serieB"))}
            />
          ) : null}
          {activeStackedSeriesKeys.includes("serieC") ? (
            <Bar
              dataKey="serieC"
              name={stackedLabels.serieC}
              stackId="total"
              fill={palette[2]}
              radius={CHART_THEME.bar.radiusStackTop}
              activeBar={getBarActiveProps(palette[2])}
              {...staggerAnimation(activeStackedSeriesKeys.indexOf("serieC"))}
            />
          ) : null}
          <ChartBrushLayer model={model} xKey="name" pointCount={multiSeriesData.length} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function LineChartWidget({ model }: ChartWidgetProps) {
  const animationProps = useChartAnimationProps();
  const staggerAnimation = useStaggeredChartAnimation();
  const {
    widget,
    responsiveChartHeight,
    accentColor,
    showGrid,
    smoothLines,
    sourceDataWithMaRef,
    chartMargin,
    formatTick,
    yDomain,
    executiveTooltipContent,
    compactLegend,
    compactStackedLegend,
    renderColoredDot,
    activeDotRenderer,
    showMaRefOnCartesian,
  } = model;
  const dualConfig = getDualSeriesConfig(model);

  if (dualConfig && isMultiSeriesSource(widget.dataSource)) {
    const xProps = axisProps(model, dualConfig.xKey);
    return (
      <ChartShell height={responsiveChartHeight} accentColor={accentColor} {...chartBrushShellExtras(model)}>
        <ResponsiveContainer width="100%" height={responsiveChartHeight}>
          <LineChart data={sourceDataWithMaRef} margin={chartMargin}>
            <ChartGrid show={showGrid} />
            <ChartXAxis {...xProps} />
            <ChartYAxis tick={model.tickBySize} formatTick={formatTick} domain={yDomain} />
            <ChartTooltip content={executiveTooltipContent} />
            {compactStackedLegend}
            {dualConfig.keys.map((series, index) => (
              <Line
                key={series.dataKey}
                type={smoothLines ? "monotone" : "linear"}
                dataKey={series.dataKey}
                name={series.name}
                stroke={series.color}
                strokeWidth={CHART_THEME.line.strokeWidth}
                dot={renderColoredDot}
                activeDot={getActiveDotRenderer(series.color)}
                connectNulls
                {...staggerAnimation(index)}
              />
            ))}
            <ChartBrushLayer model={model} xKey={dualConfig.xKey} pointCount={sourceDataWithMaRef.length} />
          </LineChart>
        </ResponsiveContainer>
      </ChartShell>
    );
  }

  const dataKey = widget.dataSource === "sla_compliance" ? "cumplido" : "value";
  const xKey = widget.dataSource === "sla_compliance" ? "day" : "name";
  const seriesName = getPrimarySeriesName(widget.dataSource, dataKey);
  const xProps = axisProps(model, xKey);

  return (
    <ChartShell height={responsiveChartHeight} accentColor={accentColor}>
      <ResponsiveContainer width="100%" height={responsiveChartHeight}>
        <LineChart data={sourceDataWithMaRef} margin={chartMargin}>
          <ChartGrid show={showGrid} />
          <ChartXAxis {...xProps} />
          <ChartYAxis tick={model.tickBySize} formatTick={formatTick} domain={yDomain} />
          <ChartTooltip content={executiveTooltipContent} />
          {compactLegend}
          <Line
            type={smoothLines ? "monotone" : "linear"}
            dataKey={dataKey}
            name={seriesName}
            stroke={accentColor}
            strokeWidth={CHART_THEME.line.strokeWidth}
            dot={renderColoredDot}
            activeDot={activeDotRenderer}
            connectNulls
            {...animationProps}
          />
          {showMaRefOnCartesian ? (
            <Line
              type={smoothLines ? "monotone" : "linear"}
              dataKey="maRef"
              name="Media móvil"
              legendType="none"
              stroke="rgba(148,163,184,0.72)"
              strokeWidth={CHART_THEME.line.maStrokeWidth}
              strokeDasharray={CHART_THEME.line.maDash}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function StackedAreaChartWidget({ model }: ChartWidgetProps) {
  const staggerAnimation = useStaggeredChartAnimation();
  const lineType = (smooth: boolean) => (smooth ? "monotone" : "linear");
  const {
    widget,
    responsiveChartHeight,
    accentColor,
    showGrid,
    smoothLines,
    multiSeriesDataWithMaRef,
    activeStackedSeriesKeys,
    chartIdPrefix,
    chartMargin,
    formatTick,
    executiveTooltipContent,
    compactStackedLegend,
    stackedLabels,
    palette,
    showMaRefOnStackedArea,
  } = model;
  const xProps = axisProps(model, "name");

  return (
    <ChartShell
      height={responsiveChartHeight}
      accentColor={accentColor}
      ariaLabel={widget.title}
      {...chartBrushShellExtras(model)}
    >
      <ResponsiveContainer width="100%" height={responsiveChartHeight}>
        <AreaChart data={multiSeriesDataWithMaRef} margin={chartMargin}>
          <ChartGradientDefs idPrefix={chartIdPrefix} colors={palette.slice(0, activeStackedSeriesKeys.length)} />
          <ChartGrid show={showGrid} />
          <ChartXAxis {...xProps} />
          <ChartYAxis tick={model.tickBySize} formatTick={formatTick} />
          <ChartTooltip content={executiveTooltipContent} />
          {compactStackedLegend}
          {activeStackedSeriesKeys.includes("serieA") ? (
            <Area
              type={lineType(smoothLines)}
              dataKey="serieA"
              name={stackedLabels.serieA}
              stackId="1"
              stroke={palette[0]}
              fill={`url(#${chartIdPrefix}-fill-0)`}
              fillOpacity={1}
              strokeWidth={CHART_THEME.area.strokeWidth}
              activeDot={getActiveDotRenderer(palette[0])}
              {...staggerAnimation(activeStackedSeriesKeys.indexOf("serieA"))}
            />
          ) : null}
          {activeStackedSeriesKeys.includes("serieB") ? (
            <Area
              type={lineType(smoothLines)}
              dataKey="serieB"
              name={stackedLabels.serieB}
              stackId="1"
              stroke={palette[1]}
              fill={`url(#${chartIdPrefix}-fill-1)`}
              fillOpacity={1}
              strokeWidth={CHART_THEME.area.strokeWidth}
              activeDot={getActiveDotRenderer(palette[1])}
              {...staggerAnimation(activeStackedSeriesKeys.indexOf("serieB"))}
            />
          ) : null}
          {activeStackedSeriesKeys.includes("serieC") ? (
            <Area
              type={lineType(smoothLines)}
              dataKey="serieC"
              name={stackedLabels.serieC}
              stackId="1"
              stroke={palette[2]}
              fill={`url(#${chartIdPrefix}-fill-2)`}
              fillOpacity={1}
              strokeWidth={CHART_THEME.area.strokeWidth}
              activeDot={getActiveDotRenderer(palette[2])}
              {...staggerAnimation(activeStackedSeriesKeys.indexOf("serieC"))}
            />
          ) : null}
          {showMaRefOnStackedArea ? (
            <Line
              type={smoothLines ? "monotone" : "linear"}
              dataKey="maRef"
              name="Media móvil (serie A)"
              legendType="none"
              stroke="rgba(148,163,184,0.82)"
              strokeWidth={CHART_THEME.line.maStrokeWidth}
              strokeDasharray={CHART_THEME.line.maDash}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ) : null}
          <ChartBrushLayer model={model} xKey="name" pointCount={multiSeriesDataWithMaRef.length} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function BarHorizontalChartWidget({ model }: ChartWidgetProps) {
  const animationProps = useChartAnimationProps();
  const staggerAnimation = useStaggeredChartAnimation();
  const { onSegmentClick } = useChartDrillNavigate(model.widget.dataSource);
  const {
    widget,
    responsiveChartHeight,
    accentColor,
    showGrid,
    sourceData,
    multiSeriesData,
    stackedLabels,
    palette,
    isSmallWidget,
    formatTick,
    executiveTooltipContent,
    compactLegend,
    compactStackedLegend,
    entryColors,
  } = model;

  if (isComparisonMultiSeriesSource(widget.dataSource)) {
    return (
      <ChartShell height={responsiveChartHeight} accentColor={accentColor} ariaLabel={`${widget.title}: comparativa por turno`}>
        <ResponsiveContainer width="100%" height={responsiveChartHeight}>
          <BarChart
            data={multiSeriesData}
            layout="vertical"
            margin={getVerticalBarMargin(isSmallWidget, model.isHighDensity)}
          >
            {showGrid ? (
              <CartesianGrid strokeDasharray={CHART_THEME.grid.dash} stroke={CHART_THEME.grid.stroke} horizontal={false} />
            ) : null}
            <XAxis type="number" tick={model.tickBySize} tickFormatter={formatTick} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tick={model.tickBySize}
              axisLine={false}
              tickLine={false}
              width={isSmallWidget ? 48 : 56}
            />
            <ChartTooltip content={executiveTooltipContent} cursor={{ fill: CHART_THEME.bar.background }} />
            {compactStackedLegend}
            <Bar
              dataKey="serieA"
              name={stackedLabels.serieA}
              fill={palette[0]}
              radius={CHART_THEME.bar.radiusHorizontal}
              maxBarSize={CHART_THEME.bar.maxSize}
              background={{ fill: CHART_THEME.bar.background }}
              activeBar={getBarActiveProps(palette[0])}
              cursor="pointer"
              onClick={onSegmentClick}
              {...staggerAnimation(0)}
            />
            <Bar
              dataKey="serieB"
              name={stackedLabels.serieB}
              fill={palette[1]}
              radius={CHART_THEME.bar.radiusHorizontal}
              maxBarSize={CHART_THEME.bar.maxSize}
              background={{ fill: CHART_THEME.bar.background }}
              activeBar={getBarActiveProps(palette[1])}
              cursor="pointer"
              onClick={onSegmentClick}
              {...staggerAnimation(1)}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartShell>
    );
  }

  const drillEnabled = sourceData.some((row) => Boolean(getBandejaDrillHref(widget.dataSource, String(row.name ?? ""))));

  return (
    <ChartShell height={responsiveChartHeight} accentColor={accentColor} ariaLabel={widget.title}>
      <ResponsiveContainer width="100%" height={responsiveChartHeight}>
        <BarChart
          data={sourceData}
          layout="vertical"
          margin={getVerticalBarMargin(isSmallWidget, model.isHighDensity)}
        >
          {showGrid ? (
            <CartesianGrid strokeDasharray={CHART_THEME.grid.dash} stroke={CHART_THEME.grid.stroke} horizontal={false} />
          ) : null}
          <XAxis type="number" tick={model.tickBySize} tickFormatter={formatTick} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={model.tickBySize}
            axisLine={false}
            tickLine={false}
            width={isSmallWidget ? 48 : 56}
          />
          <ChartTooltip content={executiveTooltipContent} cursor={{ fill: CHART_THEME.bar.background }} shared={false} />
          {compactLegend}
          <Bar
            dataKey="value"
            radius={CHART_THEME.bar.radiusHorizontal}
            maxBarSize={CHART_THEME.bar.maxSize}
            background={{ fill: CHART_THEME.bar.background }}
            activeBar={getBarActiveProps(accentColor)}
            cursor={drillEnabled ? "pointer" : undefined}
            onClick={onSegmentClick}
            {...animationProps}
          >
            {sourceData.map((_, index) => (
              <Cell key={index} fill={entryColors[index]} cursor={drillEnabled ? "pointer" : undefined} onClick={onSegmentClick} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function ComposedChartWidget({ model }: ChartWidgetProps) {
  const staggerAnimation = useStaggeredChartAnimation();
  const {
    widget,
    responsiveChartHeight,
    accentColor,
    showGrid,
    smoothLines,
    sourceData,
    multiSeriesData,
    chartMargin,
    formatTick,
    yDomain,
    executiveTooltipContent,
    compactLegend,
    compactStackedLegend,
    stackedLabels,
    palette,
    renderColoredDot,
    activeDotRenderer,
    entryColors,
    isHighDensity,
  } = model;
  const composedData = isMultiSeriesSource(widget.dataSource) ? multiSeriesData : sourceData;
  const xProps = axisProps(model, "name");
  const dense = isHighDensity;
  const barMaxSize = dense ? 30 : CHART_THEME.bar.maxSize;
  const lineStrokeWidth = dense ? 1.85 : CHART_THEME.line.strokeWidth;
  const barRadius = dense ? ([5, 5, 0, 0] as [number, number, number, number]) : CHART_THEME.bar.radius;
  const showLineDots = !dense;

  return (
    <ChartShell
      height={responsiveChartHeight}
      accentColor={accentColor}
      highDensity={isHighDensity}
      {...chartBrushShellExtras(model)}
    >
      <ResponsiveContainer width="100%" height={responsiveChartHeight}>
        <ComposedChart data={composedData} margin={chartMargin}>
          <ChartGrid show={showGrid && !dense} />
          <ChartXAxis {...xProps} />
          <ChartYAxis
            tick={model.tickBySize}
            formatTick={formatTick}
            domain={yDomain}
            width={dense ? 34 : 42}
          />
          <ChartTooltip content={executiveTooltipContent} cursor={{ fill: CHART_THEME.bar.background }} />
          {isMultiSeriesSource(widget.dataSource) ? compactStackedLegend : compactLegend}
          {isMultiSeriesSource(widget.dataSource) ? (
            <>
              <Bar
                dataKey="serieA"
                name={stackedLabels.serieA}
                fill={palette[0]}
                fillOpacity={dense ? 0.82 : 0.9}
                radius={barRadius}
                maxBarSize={barMaxSize}
                background={getBarBackgroundProps()}
                activeBar={getBarActiveProps(palette[0])}
                {...staggerAnimation(0)}
              />
              <Line
                type={smoothLines ? "monotone" : "linear"}
                dataKey="serieB"
                name={stackedLabels.serieB}
                stroke={palette[1]}
                strokeWidth={lineStrokeWidth}
                dot={showLineDots ? renderColoredDot : false}
                activeDot={activeDotRenderer}
                connectNulls
                {...staggerAnimation(1)}
              />
            </>
          ) : (
            <>
              <Bar
                dataKey="value"
                name={getPrimarySeriesName(widget.dataSource, "value")}
                fillOpacity={dense ? 0.82 : 0.9}
                radius={barRadius}
                maxBarSize={barMaxSize}
                background={getBarBackgroundProps()}
                activeBar={getBarActiveProps(accentColor)}
                {...staggerAnimation(0)}
              >
                {sourceData.map((_, index) => (
                  <Cell key={index} fill={entryColors[index]} />
                ))}
              </Bar>
              <Line
                type={smoothLines ? "monotone" : "linear"}
                dataKey="value"
                name={getPrimarySeriesName(widget.dataSource, "value")}
                stroke={accentColor}
                strokeWidth={lineStrokeWidth}
                dot={showLineDots ? renderColoredDot : false}
                activeDot={activeDotRenderer}
                connectNulls
                legendType="none"
                {...staggerAnimation(1)}
              />
            </>
          )}
          <ChartBrushLayer model={model} xKey="name" pointCount={composedData.length} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
