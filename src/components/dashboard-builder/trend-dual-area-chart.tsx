"use client";

import { DualTimeSeriesAreaChart } from "@/components/dashboard-builder/charts/dual-time-series-area-chart";
import { getTicketsTrendSeries, CHART_SERIES } from "@/lib/dashboard/chart-palette";

export type TrendDualRow = {
  day: string;
  creados: number;
  resueltos: number;
};

type TrendDualAreaChartProps = {
  data: TrendDualRow[];
  height?: number | `${number}%`;
  showBrush?: boolean;
  idPrefix?: string;
  showLegend?: boolean;
  xTickFormatter?: (value: string) => string;
};

/** Gráfico de tendencia del panel principal — misma capa que custom dashboards. */
export function TrendDualAreaChart({
  data,
  height = "100%",
  showBrush,
  idPrefix = "trend-main",
  showLegend = false,
  xTickFormatter,
}: TrendDualAreaChartProps) {
  return (
    <DualTimeSeriesAreaChart
      data={data}
      xKey="day"
      series={[...getTicketsTrendSeries()]}
      accentColor={CHART_SERIES.created}
      dataSource="tickets_trend"
      idPrefix={idPrefix}
      height={height}
      showBrush={showBrush}
      isSmall={data.length > 20}
      showLegend={showLegend}
      xTickFormatter={xTickFormatter}
    />
  );
}
