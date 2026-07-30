"use client";

import { useMemo } from "react";

import {
  ChartLegend,
  getActiveDotRenderer,
  getCategoryDotRenderer,
  getChartMargin,
} from "@/components/dashboard-builder/chart-primitives";
import { formatMetric, getYDomain, getXAxisInterval, getXAxisLabelAngle, getCartesianMarginWithBrush, shouldShowChartBrush, CHART_THEME } from "@/lib/dashboard/chart-theme";
import { buildChartPalette, getPieRadii, isDenseOrdinalSeries } from "@/lib/dashboard/chart-palette";
import { getDataSourceLabel } from "@/lib/dashboard/data-sources";
import { parseWidgetLayout } from "@/lib/dashboard/widget-layout";
import { deriveWidgetDensity, isHighDensityLayout } from "@/lib/dashboard/widget-density";
import {
  buildMultiSeriesData,
  buildNumericValues,
  getActiveStackedSeriesKeys,
  getAnalyticsRows,
  getEntryLabel,
  getPrimarySeriesName,
  isMultiSeriesSource,
  isTicketDistributionSource,
  isTimeSeriesSource,
} from "@/lib/dashboard/widget-data-helpers";

import {
  createTreemapCellRenderer,
  getCardInsightLine,
  getDataSourceMicrocopy,
  getSmartCategoryColor,
  getTrailingMovingAverageBefore,
} from "./chart-utils.impl";
import { useExecutiveTooltipContent } from "./executive-tooltip";
import type { ChartWidgetModel, LegendEntry, UseChartWidgetModelParams } from "./types";

export function useChartWidgetModel({
  widget,
  data,
  chartHeight,
  parsedConfig,
}: UseChartWidgetModelParams): ChartWidgetModel {
  const responsiveChartHeight = Math.max(20, Math.round(chartHeight ?? 220));

  const accentColor = parsedConfig.accentColor ?? "#2563EB";
  const widgetLayout = useMemo(
    () => parseWidgetLayout(widget.config ?? "{}", widget.size),
    [widget.config, widget.size],
  );
  const density = deriveWidgetDensity(widgetLayout);
  const isHighDensity = isHighDensityLayout(widgetLayout);
  const isSmallWidget = density === "small";
  const isCompactChart = isSmallWidget || isHighDensity;
  const showLegend = (parsedConfig.showLegend ?? true) && !isHighDensity;
  const showGrid = parsedConfig.showGrid ?? true;
  const smoothLines = parsedConfig.smoothLines ?? true;
  const metricFormat = parsedConfig.metricFormat ?? "number";
  const stackedLabels = useMemo(() => {
    if (widget.dataSource === "tickets_trend") {
      return {
        serieA: parsedConfig.seriesLabels?.serieA?.trim() || "Creados",
        serieB: parsedConfig.seriesLabels?.serieB?.trim() || "Resueltos",
        serieC: parsedConfig.seriesLabels?.serieC?.trim() || "—",
      };
    }
    if (widget.dataSource === "sla_compliance") {
      return {
        serieA: parsedConfig.seriesLabels?.serieA?.trim() || "En plazo",
        serieB: parsedConfig.seriesLabels?.serieB?.trim() || "Fuera de plazo",
        serieC: parsedConfig.seriesLabels?.serieC?.trim() || "—",
      };
    }
    if (widget.dataSource === "shift_comparison") {
      return {
        serieA: parsedConfig.seriesLabels?.serieA?.trim() || "Ayer",
        serieB: parsedConfig.seriesLabels?.serieB?.trim() || "Hoy",
        serieC: parsedConfig.seriesLabels?.serieC?.trim() || "—",
      };
    }
    return {
      serieA: parsedConfig.seriesLabels?.serieA?.trim() || "Principal",
      serieB: parsedConfig.seriesLabels?.serieB?.trim() || "Secundaria",
      serieC: parsedConfig.seriesLabels?.serieC?.trim() || "Auxiliar",
    };
  }, [widget.dataSource, parsedConfig.seriesLabels?.serieA, parsedConfig.seriesLabels?.serieB, parsedConfig.seriesLabels?.serieC]);

  const sourceData = useMemo(
    () =>
      widget.dataSource === "manual"
        ? (parsedConfig.manualData ?? [])
        : getAnalyticsRows(data, widget.dataSource),
    [widget.dataSource, parsedConfig.manualData, data],
  );

  const palette = useMemo(() => buildChartPalette(accentColor), [accentColor]);
  const chartIdPrefix = useMemo(() => `w-${widget.id.replace(/[^a-zA-Z0-9_-]/g, "")}`, [widget.id]);
  const pieRadii = getPieRadii(responsiveChartHeight, "donut", isHighDensity);
  const roseRadii = getPieRadii(responsiveChartHeight, "rose", isHighDensity);

  const entryColors = useMemo(() => {
    if (isDenseOrdinalSeries(widget.dataSource)) {
      return sourceData.map(() => accentColor);
    }
    return sourceData.map((entry, index) => getSmartCategoryColor(getEntryLabel(entry) || String(index), palette));
  }, [sourceData, palette, widget.dataSource, accentColor]);

  const legendPayload = useMemo(() => {
    if (!showLegend || isDenseOrdinalSeries(widget.dataSource)) return undefined;
    return sourceData.map((entry, index) => ({
      value: getEntryLabel(entry),
      id: index,
      type: "square" as const,
      color: entryColors[index],
    }));
  }, [showLegend, sourceData, entryColors, widget.dataSource]);

  const multiSeriesData = useMemo(
    () => buildMultiSeriesData(sourceData, widget.dataSource),
    [sourceData, widget.dataSource],
  );

  const activeStackedSeriesKeys = useMemo(
    () => getActiveStackedSeriesKeys(multiSeriesData),
    [multiSeriesData],
  );

  const stackedSeriesLegendPayload = useMemo(() => {
    if (!showLegend) return undefined;
    const items = [
      { value: stackedLabels.serieA, id: "serieA" as const, type: "square", color: palette[0] },
      { value: stackedLabels.serieB, id: "serieB" as const, type: "square", color: palette[1] },
      { value: stackedLabels.serieC, id: "serieC" as const, type: "square", color: palette[2] },
    ];
    return items.filter((item) => activeStackedSeriesKeys.includes(item.id));
  }, [showLegend, palette, stackedLabels.serieA, stackedLabels.serieB, stackedLabels.serieC, activeStackedSeriesKeys]);

  const chartMargin = getChartMargin(isSmallWidget, isHighDensity);
  const showChartBrush = useMemo(
    () => isTimeSeriesSource(widget.dataSource) && shouldShowChartBrush(sourceData.length),
    [widget.dataSource, sourceData.length],
  );
  const chartMarginResolved = useMemo(
    () => (showChartBrush ? getCartesianMarginWithBrush(isSmallWidget, isHighDensity) : chartMargin),
    [showChartBrush, isSmallWidget, isHighDensity, chartMargin],
  );
  const isDonut = widget.chartType === "pie";
  const dataSourceLabel = getDataSourceLabel(widget.dataSource);
  const dataSourceMicrocopy = getDataSourceMicrocopy(widget.dataSource, sourceData.length);
  const tickBySize = isCompactChart ? CHART_THEME.axisTickSmall : CHART_THEME.axisTick;

  const renderCompactLegend = (
    payload: ReadonlyArray<LegendEntry> | undefined,
    options?: { isDonut?: boolean; stacked?: boolean },
  ) => {
    if (!showLegend || !payload) return null;
    const paddingTop = options?.isDonut && !isCompactChart ? "10px" : isHighDensity ? "2px" : "6px";
    return (
      <ChartLegend
        payload={payload}
        isSmallWidget={isCompactChart}
        ultraCompact={isHighDensity}
        paddingTop={paddingTop}
      />
    );
  };

  const timeSeriesSeriesLegend = useMemo((): LegendEntry[] | undefined => {
    if (!showLegend || !isMultiSeriesSource(widget.dataSource)) return undefined;
    if (widget.chartType === "stacked_bar" || widget.chartType === "stacked_area" || widget.chartType === "composed") {
      return undefined;
    }
    const dataKey = widget.dataSource === "sla_compliance" ? "cumplido" : "value";
    return [
      {
        value: getPrimarySeriesName(widget.dataSource, dataKey),
        color: accentColor,
      },
    ];
  }, [showLegend, widget.dataSource, widget.chartType, accentColor]);

  const compactLegend = renderCompactLegend(
    isDenseOrdinalSeries(widget.dataSource)
      ? undefined
      : isTicketDistributionSource(widget.dataSource) || widget.dataSource === "manual"
        ? legendPayload
        : timeSeriesSeriesLegend,
    { isDonut },
  );
  const compactStackedLegend = renderCompactLegend(stackedSeriesLegendPayload, { stacked: true });

  const renderColoredDot = getCategoryDotRenderer(entryColors);
  const activeDotRenderer = getActiveDotRenderer(accentColor);
  const formatTick = (value: number | string) => formatMetric(value, metricFormat);

  const numericValues = useMemo(
    () => buildNumericValues(sourceData, widget.dataSource),
    [sourceData, widget.dataSource],
  );

  const sourceDataWithMaRef = useMemo(
    () =>
      sourceData.map((entry, i) => ({
        ...entry,
        maRef: getTrailingMovingAverageBefore(numericValues, i),
      })) as ChartWidgetModel["sourceDataWithMaRef"],
    [sourceData, numericValues],
  );

  const multiSeriesDataWithMaRef = useMemo(() => {
    const serieAValues = multiSeriesData.map((row) => row.serieA);
    return multiSeriesData.map((row, i) => ({
      ...row,
      maRef: getTrailingMovingAverageBefore(serieAValues, i),
    })) as ChartWidgetModel["multiSeriesDataWithMaRef"];
  }, [multiSeriesData]);

  const showMaRefOnCartesian = useMemo(() => {
    if (isTicketDistributionSource(widget.dataSource)) return false;
    if (numericValues.length < 2) return false;
    const minV = Math.min(...numericValues);
    const maxV = Math.max(...numericValues);
    const span = Math.max(maxV - minV, 1e-9);
    const eps = Math.max(1e-9, span * 0.015);
    for (let i = 1; i < numericValues.length; i += 1) {
      const ma = getTrailingMovingAverageBefore(numericValues, i);
      if (ma != null && Math.abs(numericValues[i] - ma) > eps) return true;
    }
    return false;
  }, [numericValues, widget.dataSource]);

  const showMaRefOnStackedArea = useMemo(() => {
    if (isTicketDistributionSource(widget.dataSource)) return false;
    const serieA = multiSeriesData.map((row) => row.serieA);
    if (serieA.length < 2) return false;
    const span = Math.max(Math.max(...serieA) - Math.min(...serieA), 1e-9);
    const eps = Math.max(1e-9, span * 0.015);
    for (let i = 1; i < serieA.length; i += 1) {
      const ma = getTrailingMovingAverageBefore(serieA, i);
      if (ma != null && Math.abs(serieA[i] - ma) > eps) return true;
    }
    return false;
  }, [multiSeriesData, widget.dataSource]);

  const yDomain = useMemo(() => getYDomain(numericValues), [numericValues]);

  const pieTotal = useMemo(() => numericValues.reduce((sum, value) => sum + value, 0), [numericValues]);

  const xAxisInterval = useMemo(
    () => getXAxisInterval(sourceData.length, isCompactChart),
    [sourceData.length, isCompactChart],
  );

  const xAxisAngle = useMemo(
    () => getXAxisLabelAngle(sourceData.length, isCompactChart),
    [sourceData.length, isCompactChart],
  );

  const cardInsightLine = useMemo(
    () =>
      getCardInsightLine(
        widget.dataSource,
        sourceData,
        numericValues,
        metricFormat,
        data.periodComparison ?? null,
      ),
    [widget.dataSource, sourceData, numericValues, metricFormat, data.periodComparison],
  );

  const executiveTooltipContent = useExecutiveTooltipContent({
    accentColor,
    metricFormat,
    numericValues,
    sourceData,
    dataSource: widget.dataSource,
  });

  const renderTreemapCell = useMemo(
    () => createTreemapCellRenderer(accentColor, numericValues),
    [accentColor, numericValues],
  );

  return {
    widget,
    data,
    responsiveChartHeight,
    accentColor,
    showLegend,
    showGrid,
    smoothLines,
    metricFormat,
    stackedLabels,
    sourceData,
    palette,
    chartIdPrefix,
    pieRadii,
    roseRadii,
    entryColors,
    compactLegend,
    compactStackedLegend,
    isSmallWidget,
    isHighDensity,
    isDonut,
    chartMargin: chartMarginResolved,
    showChartBrush,
    tickBySize,
    renderColoredDot,
    activeDotRenderer,
    formatTick,
    multiSeriesData,
    activeStackedSeriesKeys,
    numericValues,
    sourceDataWithMaRef,
    multiSeriesDataWithMaRef,
    showMaRefOnCartesian,
    showMaRefOnStackedArea,
    yDomain,
    dataSourceLabel,
    dataSourceMicrocopy,
    cardInsightLine,
    executiveTooltipContent,
    renderTreemapCell,
    pieTotal,
    xAxisInterval,
    xAxisAngle,
  };
}
