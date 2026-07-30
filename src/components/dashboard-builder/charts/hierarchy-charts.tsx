"use client";

import { useMemo } from "react";
import {
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Sankey,
  Treemap,
} from "recharts";

import {
  ChartShell,
  ChartTooltip,
} from "@/components/dashboard-builder/chart-primitives";
import { useChartAnimationProps } from "@/hooks/use-chart-motion";
import { colorWithAlpha } from "@/lib/dashboard/chart-palette";
import { formatMetric } from "@/lib/dashboard/chart-theme";
import { buildSankeyGraph, getEntryLabel } from "@/lib/dashboard/widget-data-helpers";

import type { ChartWidgetModel } from "./types";

type ChartWidgetProps = {
  model: ChartWidgetModel;
};

export function TreemapChartWidget({ model }: ChartWidgetProps) {
  const animationProps = useChartAnimationProps();
  const {
    responsiveChartHeight,
    accentColor,
    sourceData,
    executiveTooltipContent,
    compactLegend,
    entryColors,
    renderTreemapCell,
  } = model;

  return (
    <ChartShell height={responsiveChartHeight} accentColor={accentColor}>
      <ResponsiveContainer width="100%" height={responsiveChartHeight}>
        <Treemap
          data={sourceData}
          dataKey="value"
          nameKey="name"
          stroke="rgba(255,255,255,0.14)"
          fill={accentColor}
          content={renderTreemapCell}
          {...animationProps}
        >
          {sourceData.map((entry, index) => (
            <Cell key={`${entry.name}-${index}`} fill={entryColors[index]} />
          ))}
          <ChartTooltip content={executiveTooltipContent} shared={false} />
        </Treemap>
      </ResponsiveContainer>
      {compactLegend}
    </ChartShell>
  );
}

export function SankeyChartWidget({ model }: ChartWidgetProps) {
  const animationProps = useChartAnimationProps();
  const {
    widget,
    responsiveChartHeight,
    accentColor,
    sourceData,
    executiveTooltipContent,
    compactLegend,
    entryColors,
  } = model;

  const { nodes: sankeyNodes, links: sankeyLinks } = buildSankeyGraph(
    sourceData,
    widget.dataSource,
    entryColors,
  );

  if (sankeyNodes.length === 0 || sankeyLinks.length === 0) {
    return (
      <ChartShell height={responsiveChartHeight} accentColor={accentColor} ariaLabel={widget.title}>
        <div className="flex h-full items-center justify-center px-4 text-center text-caption text-[var(--color-text-3)]">
          Sin flujos suficientes para el diagrama Sankey.
        </div>
        {compactLegend}
      </ChartShell>
    );
  }

  return (
    <ChartShell height={responsiveChartHeight} accentColor={accentColor} ariaLabel={widget.title}>
      <ResponsiveContainer width="100%" height={responsiveChartHeight}>
        <Sankey
          data={{ nodes: sankeyNodes, links: sankeyLinks }}
          nodePadding={18}
          nodeWidth={12}
          link={{
            strokeOpacity: 0.48,
            stroke: colorWithAlpha(accentColor, 0.35),
          }}
          node={{ fill: colorWithAlpha(accentColor, 0.62), stroke: "rgba(255,255,255,0.2)", strokeWidth: 1 }}
          margin={{ top: 10, right: 14, bottom: 10, left: 14 }}
          {...animationProps}
        >
          {sankeyLinks.map((link, index) => (
            <Cell key={`sankey-link-${index}`} fill={link.fill ?? entryColors[index] ?? accentColor} />
          ))}
          <ChartTooltip content={executiveTooltipContent} />
        </Sankey>
      </ResponsiveContainer>
      {compactLegend}
    </ChartShell>
  );
}

function FunnelStageLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string | number;
  value?: number | string;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, value } = props;
  if (width < 48 || height < 14) return null;
  const label = String(name ?? "");
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  const valueText = Number.isFinite(numeric) ? formatMetric(numeric, "integer") : "";
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="var(--color-text-1)"
      fontSize={11}
      fontWeight={650}
      className="dashboard-funnel-label"
    >
      {valueText ? `${label} · ${valueText}` : label}
    </text>
  );
}

export function FunnelChartWidget({ model }: ChartWidgetProps) {
  const animationProps = useChartAnimationProps();
  const {
    responsiveChartHeight,
    accentColor,
    sourceData,
    executiveTooltipContent,
    entryColors,
    formatTick,
  } = model;

  const funnelData = useMemo(
    () =>
      sourceData
        .map((row, index) => ({
          name: getEntryLabel(row),
          value: Number(row.value ?? 0),
          fill: entryColors[index] ?? accentColor,
        }))
        .filter((row) => Number.isFinite(row.value) && row.value > 0),
    [sourceData, entryColors, accentColor],
  );

  if (funnelData.length === 0) {
    return (
      <ChartShell height={responsiveChartHeight} accentColor={accentColor}>
        <div className="flex h-full items-center justify-center px-4 text-center text-caption text-[var(--color-text-3)]">
          Sin etapas con valor para el embudo.
        </div>
      </ChartShell>
    );
  }

  return (
    <ChartShell height={responsiveChartHeight} accentColor={accentColor} className="dashboard-funnel-shell">
      <ResponsiveContainer width="100%" height={Math.max(120, responsiveChartHeight - 36)}>
        <FunnelChart margin={{ top: 10, right: 16, bottom: 10, left: 16 }}>
          <ChartTooltip content={executiveTooltipContent} shared={false} />
          <Funnel
            dataKey="value"
            nameKey="name"
            data={funnelData}
            isAnimationActive={animationProps.isAnimationActive}
            animationDuration={animationProps.animationDuration}
            lastShapeType="rectangle"
            stroke="var(--color-surface)"
            strokeWidth={2}
          >
            {funnelData.map((row, index) => (
              <Cell key={`${row.name}-${index}`} fill={row.fill} />
            ))}
            <LabelList
              position="center"
              content={(props) => (
                <FunnelStageLabel
                  x={props.x as number | undefined}
                  y={props.y as number | undefined}
                  width={props.width as number | undefined}
                  height={props.height as number | undefined}
                  name={props.name as string | number | undefined}
                  value={props.value as number | string | undefined}
                />
              )}
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
      <div className="dashboard-chart-legend dashboard-chart-legend--compact dashboard-funnel-legend">
        {funnelData.map((row, index) => (
          <span key={`${row.name}-${index}`} className="dashboard-chart-legend__item">
            <span className="dashboard-chart-legend__dot" style={{ backgroundColor: row.fill }} />
            <span className="dashboard-chart-legend__label">
              {row.name} ({formatTick(row.value)})
            </span>
          </span>
        ))}
      </div>
    </ChartShell>
  );
}
