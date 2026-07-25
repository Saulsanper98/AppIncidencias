export const CHART_TYPES = [
  "kpi",
  "area",
  "bar",
  "stacked_bar",
  "bar_horizontal",
  "pie",
  "rose",
  "line",
  "stacked_area",
  "composed",
  "radar",
  "radialbar",
  "scatter",
  "bubble",
  "treemap",
  "sankey",
  "funnel",
] as const;

export type ChartType = (typeof CHART_TYPES)[number];
