"use client";



import { useMemo } from "react";

import {

  Cell,

  Pie,

  PieChart,

  PolarAngleAxis,

  PolarGrid,

  PolarRadiusAxis,

  Radar,

  RadarChart,

  RadialBar,

  RadialBarChart,

  ResponsiveContainer,

} from "recharts";



import {

  ChartShell,

  ChartTooltip,

  DonutCenterMetric,

  renderActivePieSector,

} from "@/components/dashboard-builder/chart-primitives";

import { useChartAnimationProps, useStaggeredChartAnimation } from "@/hooks/use-chart-motion";
import { useChartDrillNavigate } from "@/hooks/use-chart-drill-navigate";
import { CHART_THEME, getPieSliceAngles, getRoseSliceOuterRadius } from "@/lib/dashboard/chart-theme";
import { getBandejaDrillHref } from "@/lib/dashboard/widget-data-helpers";

import type { ChartWidgetModel } from "./types";



type ChartWidgetProps = {

  model: ChartWidgetModel;

};



function InteractivePie({

  model,

  radii,

  variant,

}: ChartWidgetProps & { radii: ChartWidgetModel["pieRadii"]; variant: "donut" | "rose" }) {

  const staggerAnimation = useStaggeredChartAnimation();
  const animationProps = useChartAnimationProps();
  const { onSegmentClick } = useChartDrillNavigate(model.widget.dataSource);

  const {

    responsiveChartHeight,

    accentColor,

    sourceData,

    executiveTooltipContent,

    compactLegend,

    entryColors,

    pieTotal,

    formatTick,

    isDonut,

    isHighDensity,

    widget,

  } = model;



  const numericValues = useMemo(

    () => sourceData.map((entry) => Number(entry.value ?? 0)),

    [sourceData],

  );

  const maxValue = useMemo(() => Math.max(...numericValues, 1), [numericValues]);

  const gapDeg = variant === "rose" ? 1.5 : CHART_THEME.pie.paddingAngle;

  const baseOuter =

    typeof radii.outerRadius === "number" ? radii.outerRadius : Math.round(responsiveChartHeight * 0.34);

  const drillEnabled = sourceData.some((row) => Boolean(getBandejaDrillHref(widget.dataSource, String(row.name ?? ""))));



  return (

    <ChartShell height={responsiveChartHeight} accentColor={accentColor} highDensity={isHighDensity}>

      <ResponsiveContainer width="100%" height={responsiveChartHeight}>

        <PieChart>

          {variant === "rose" ? (
            sourceData.map((entry, index) => {
              const { startAngle, endAngle } = getPieSliceAngles(numericValues, index, gapDeg);
              const outerRadius = getRoseSliceOuterRadius(baseOuter, numericValues[index] ?? 0, maxValue);

              return (
                <Pie
                  key={`${String(entry.name)}-${index}`}
                  data={[entry]}
                  dataKey="value"
                  nameKey="name"
                  startAngle={startAngle}
                  endAngle={endAngle}
                  innerRadius={radii.innerRadius}
                  outerRadius={outerRadius}
                  cx={radii.cx}
                  cy={radii.cy}
                  paddingAngle={0}
                  stroke="var(--color-surface)"
                  strokeWidth={isHighDensity ? 1.5 : CHART_THEME.pie.strokeWidth}
                  activeShape={renderActivePieSector}
                  cursor={drillEnabled ? "pointer" : undefined}
                  onClick={onSegmentClick}
                  {...staggerAnimation(index)}
                >
                  <Cell fill={entryColors[index]} cursor={drillEnabled ? "pointer" : undefined} onClick={onSegmentClick} />
                </Pie>
              );
            })
          ) : (
            <Pie
              data={sourceData}
              dataKey="value"
              nameKey="name"
              cx={radii.cx}
              cy={radii.cy}
              innerRadius={radii.innerRadius}
              outerRadius={radii.outerRadius}
              paddingAngle={CHART_THEME.pie.paddingAngle}
              stroke="var(--color-surface)"
              strokeWidth={isHighDensity ? 1.5 : CHART_THEME.pie.strokeWidth}
              activeShape={renderActivePieSector}
              cursor={drillEnabled ? "pointer" : undefined}
              onClick={onSegmentClick}
              {...animationProps}
            >
              {sourceData.map((_, index) => (
                <Cell
                  key={`${String(sourceData[index]?.name)}-${index}`}
                  fill={entryColors[index]}
                  cursor={drillEnabled ? "pointer" : undefined}
                  onClick={onSegmentClick}
                />
              ))}
              {isDonut && pieTotal > 0 ? (
                <DonutCenterMetric
                  total={pieTotal}
                  formatTotal={(value) => formatTick(value)}
                  segmentCount={sourceData.length}
                />
              ) : null}
            </Pie>
          )}

          <ChartTooltip content={executiveTooltipContent} shared={false} />

          {compactLegend}

        </PieChart>

      </ResponsiveContainer>

    </ChartShell>

  );

}



export function PieChartWidget({ model }: ChartWidgetProps) {

  return <InteractivePie model={model} radii={model.pieRadii} variant="donut" />;

}



export function RoseChartWidget({ model }: ChartWidgetProps) {

  return <InteractivePie model={model} radii={model.roseRadii} variant="rose" />;

}



export function RadarChartWidget({ model }: ChartWidgetProps) {

  const staggerAnimation = useStaggeredChartAnimation();

  const {

    responsiveChartHeight,

    accentColor,

    sourceData,

    tickBySize,

    formatTick,

    executiveTooltipContent,

    compactLegend,

    isHighDensity,

  } = model;



  const dense = isHighDensity;

  const outerRadius = dense ? "62%" : "78%";

  const dotR = dense ? 2 : 3;

  const activeDotR = dense ? 3.5 : 5;

  const strokeWidth = dense ? 1.75 : CHART_THEME.area.strokeWidth;

  const fillOpacity = dense ? 0.16 : 0.22;



  return (

    <ChartShell height={responsiveChartHeight} accentColor={accentColor} highDensity={isHighDensity}>

      <ResponsiveContainer width="100%" height={responsiveChartHeight}>

        <RadarChart data={sourceData} cx="50%" cy="50%" outerRadius={outerRadius}>

          <PolarGrid

            stroke="rgba(148,163,184,0.14)"

            radialLines={false}

            gridType="polygon"

          />

          <PolarAngleAxis

            dataKey="name"

            tick={dense ? { ...tickBySize, fontSize: 9 } : tickBySize}

            tickLine={false}

          />

          <PolarRadiusAxis

            tick={dense ? false : tickBySize}

            tickFormatter={formatTick}

            axisLine={false}

            tickCount={dense ? 3 : 5}

          />

          <Radar

            dataKey="value"

            stroke={accentColor}

            fill={accentColor}

            fillOpacity={fillOpacity}

            strokeWidth={strokeWidth}

            dot={{ r: dotR, fill: accentColor, stroke: "var(--color-surface)", strokeWidth: 1.25 }}

            activeDot={{ r: activeDotR, fill: accentColor, stroke: "var(--color-surface)", strokeWidth: 1.75 }}

            {...staggerAnimation(0)}

          />

          <ChartTooltip content={executiveTooltipContent} shared={false} />

          {compactLegend}

        </RadarChart>

      </ResponsiveContainer>

    </ChartShell>

  );

}



export function RadialBarChartWidget({ model }: ChartWidgetProps) {

  const staggerAnimation = useStaggeredChartAnimation();

  const {

    responsiveChartHeight,

    accentColor,

    sourceData,

    executiveTooltipContent,

    compactLegend,

    entryColors,

    isHighDensity,

  } = model;



  const dense = isHighDensity;

  return (

    <ChartShell height={responsiveChartHeight} accentColor={accentColor} highDensity={isHighDensity}>

      <ResponsiveContainer width="100%" height={responsiveChartHeight}>

        <RadialBarChart

          data={sourceData.map((d, index) => ({

            ...d,

            fill: entryColors[index],

          }))}

          innerRadius={dense ? "30%" : "24%"}

          outerRadius={dense ? "88%" : "94%"}

          startAngle={180}

          endAngle={0}

          barCategoryGap={dense ? "12%" : "18%"}

        >

          <RadialBar

            dataKey="value"

            cornerRadius={dense ? 5 : 8}

            background={{ fill: "rgba(148,163,184,0.08)" }}

            {...staggerAnimation(0)}

          />

          <ChartTooltip content={executiveTooltipContent} shared={false} />

          {compactLegend}

        </RadialBarChart>

      </ResponsiveContainer>

    </ChartShell>

  );

}


