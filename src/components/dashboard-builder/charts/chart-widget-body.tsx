"use client";

import { ChartDensityProvider } from "@/components/dashboard-builder/chart-primitives";
import {
  AreaChartWidget,
  BarChartWidget,
  BarHorizontalChartWidget,
  ComposedChartWidget,
  LineChartWidget,
  StackedAreaChartWidget,
  StackedBarChartWidget,
} from "./cartesian-charts";
import {
  FunnelChartWidget,
  SankeyChartWidget,
  TreemapChartWidget,
} from "./hierarchy-charts";
import {
  PieChartWidget,
  RadarChartWidget,
  RadialBarChartWidget,
  RoseChartWidget,
} from "./polar-charts";
import { BubbleChartWidget, ScatterChartWidget } from "./scatter-charts";
import type { ChartWidgetModel } from "./types";

type ChartWidgetBodyProps = {
  model: ChartWidgetModel;
};

export function ChartWidgetBody({ model }: ChartWidgetBodyProps) {
  const body = (() => {
    switch (model.widget.chartType) {
      case "area":
        return <AreaChartWidget model={model} />;
      case "bar":
        return <BarChartWidget model={model} />;
      case "stacked_bar":
        return <StackedBarChartWidget model={model} />;
      case "line":
        return <LineChartWidget model={model} />;
      case "stacked_area":
        return <StackedAreaChartWidget model={model} />;
      case "bar_horizontal":
        return <BarHorizontalChartWidget model={model} />;
      case "composed":
        return <ComposedChartWidget model={model} />;
      case "pie":
        return <PieChartWidget model={model} />;
      case "rose":
        return <RoseChartWidget model={model} />;
      case "radar":
        return <RadarChartWidget model={model} />;
      case "radialbar":
        return <RadialBarChartWidget model={model} />;
      case "scatter":
        return <ScatterChartWidget model={model} />;
      case "bubble":
        return <BubbleChartWidget model={model} />;
      case "treemap":
        return <TreemapChartWidget model={model} />;
      case "sankey":
        return <SankeyChartWidget model={model} />;
      case "funnel":
        return <FunnelChartWidget model={model} />;
      default:
        return <div className="text-caption">Tipo de gráfica no soportado</div>;
    }
  })();

  return <ChartDensityProvider isHighDensity={model.isHighDensity}>{body}</ChartDensityProvider>;
}
