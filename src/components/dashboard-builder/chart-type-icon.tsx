"use client";

import {
  Activity,
  AreaChart,
  BarChart3,
  BarChart4,
  BarChartHorizontal,
  ChartColumn,
  CircleDot,
  Filter,
  Flower2,
  Gauge,
  GitBranch,
  LayoutGrid,
  Layers,
  LineChart,
  PieChart,
  type LucideIcon,
} from "lucide-react";

import type { ChartType } from "@/lib/dashboard/chart-types";
import { cn } from "@/lib/utils";

const CHART_TYPE_ICON_MAP: Record<ChartType | "embed" | "kpi", LucideIcon> = {
  kpi: Gauge,
  embed: LayoutGrid,
  area: AreaChart,
  bar: BarChart3,
  stacked_bar: BarChart4,
  bar_horizontal: BarChartHorizontal,
  pie: PieChart,
  rose: Flower2,
  line: LineChart,
  stacked_area: Layers,
  composed: ChartColumn,
  radar: Activity,
  radialbar: CircleDot,
  scatter: CircleDot,
  bubble: CircleDot,
  treemap: LayoutGrid,
  sankey: GitBranch,
  funnel: Filter,
};

type ChartTypeIconProps = {
  type: ChartType | string;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

/** Icono SVG Lucide para cada tipo de gráfica del dashboard. */
export function ChartTypeIcon({ type, size = 18, strokeWidth = 1.75, className }: ChartTypeIconProps) {
  const Icon = CHART_TYPE_ICON_MAP[type as ChartType] ?? BarChart3;
  return <Icon size={size} strokeWidth={strokeWidth} className={cn("shrink-0", className)} aria-hidden />;
}

export function getChartTypeIcon(type: ChartType | string): LucideIcon {
  return CHART_TYPE_ICON_MAP[type as ChartType] ?? BarChart3;
}
