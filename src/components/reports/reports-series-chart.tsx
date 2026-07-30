"use client";

import "@/app/(private)/dashboards/dashboard-builder.css";

import { TrendDualAreaChart } from "@/components/dashboard-builder/trend-dual-area-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart3 } from "lucide-react";

type Series = { day: string; creados: number; resueltos: number };

function SeriesChart({ series }: { series: Series[] }) {
  if (series.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Sin datos en el periodo"
        hint="Prueba otro rango de fechas o recarga el reporte."
        compact
      />
    );
  }

  return (
    <div className="app-chart-shell h-60 w-full">
      <TrendDualAreaChart
        data={series}
        height={240}
        showBrush={series.length > 16}
        idPrefix="reports-trend"
        showLegend
        xTickFormatter={(value) => String(value).slice(5)}
      />
    </div>
  );
}

export { SeriesChart };
