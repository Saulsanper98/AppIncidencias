import type { ReactElement, ReactNode } from "react";

import type { getChartMargin } from "@/components/dashboard-builder/chart-primitives";
import type { CustomDashboardData } from "@/lib/dashboard/dashboard-data-types";
import type { ChartType } from "@/lib/dashboard/chart-types";
import type { MetricFormat } from "@/lib/dashboard/chart-theme";
import type { getPieRadii } from "@/lib/dashboard/chart-palette";

export type DataEntry = Record<string, string | number>;

export type ChartWidgetRef = {
  id: string;
  title: string;
  chartType: ChartType;
  dataSource: string;
  size: string;
  config: string;
};

export type ChartParsedConfig = {
  manualData?: { name: string; value: number }[];
  accentColor?: string;
  showLegend?: boolean;
  seriesLabels?: {
    serieA?: string;
    serieB?: string;
    serieC?: string;
  };
  lockSeriesLabels?: boolean;
  showGrid?: boolean;
  smoothLines?: boolean;
  metricFormat?: MetricFormat;
};

export type StackedSeriesLabels = {
  serieA: string;
  serieB: string;
  serieC: string;
};

export type MultiSeriesRow = DataEntry & {
  name: string;
  serieA: number;
  serieB: number;
  serieC: number;
};

export type LegendEntry = { value?: string | number; color?: string };

export type ExecutiveTooltipPayloadItem = {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: string | number;
  /** Fila original (pie, bar…) o enlace Sankey con nodos `source` / `target`. */
  payload?: Record<string, unknown>;
};

export type ExecutiveTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<ExecutiveTooltipPayloadItem>;
  label?: string | number;
};

export type TreemapContentProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string | number;
  value?: number | string;
  fill?: string;
  index?: number;
};

export type ChartWidgetModel = {
  widget: ChartWidgetRef;
  data: CustomDashboardData;
  responsiveChartHeight: number;
  accentColor: string;
  showLegend: boolean;
  showGrid: boolean;
  smoothLines: boolean;
  metricFormat: MetricFormat;
  stackedLabels: StackedSeriesLabels;
  sourceData: DataEntry[];
  palette: string[];
  chartIdPrefix: string;
  pieRadii: ReturnType<typeof getPieRadii>;
  roseRadii: ReturnType<typeof getPieRadii>;
  entryColors: string[];
  compactLegend: ReactNode;
  compactStackedLegend: ReactNode;
  isSmallWidget: boolean;
  isHighDensity: boolean;
  isDonut: boolean;
  chartMargin: ReturnType<typeof getChartMargin>;
  showChartBrush: boolean;
  tickBySize: { fill?: string; fontSize?: number; fontWeight?: number };
  renderColoredDot: (props: { cx?: number; cy?: number; index?: number }) => ReactNode;
  activeDotRenderer: (props: { cx?: number; cy?: number }) => ReactNode;
  formatTick: (value: number | string) => string;
  multiSeriesData: MultiSeriesRow[];
  activeStackedSeriesKeys: Array<"serieA" | "serieB" | "serieC">;
  numericValues: number[];
  sourceDataWithMaRef: Array<DataEntry & { maRef: number | null }>;
  multiSeriesDataWithMaRef: Array<MultiSeriesRow & { maRef: number | null }>;
  showMaRefOnCartesian: boolean;
  showMaRefOnStackedArea: boolean;
  yDomain: [number, number];
  dataSourceLabel: string;
  dataSourceMicrocopy: string;
  cardInsightLine: string | null;
  executiveTooltipContent: (props: unknown) => ReactNode | null;
  renderTreemapCell: (props: TreemapContentProps) => ReactElement;
  pieTotal: number;
  xAxisInterval: number | "preserveStartEnd";
  xAxisAngle: number;
};

export type UseChartWidgetModelParams = {
  widget: ChartWidgetRef;
  data: CustomDashboardData;
  chartHeight?: number;
  parsedConfig: ChartParsedConfig;
};
