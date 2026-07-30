"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { formatMetric } from "@/lib/dashboard/chart-theme";
import {
  getBandejaDrillHref,
  getEntryLabel,
  isComparisonMultiSeriesSource,
} from "@/lib/dashboard/widget-data-helpers";
import { cn } from "@/lib/utils";

import type { ChartWidgetModel } from "./charts/types";

type ChartDataTableProps = {
  model: ChartWidgetModel;
  className?: string;
  caption?: string;
};

function truncateLabel(label: string, max = 28): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

export function ChartDataTable({ model, className, caption }: ChartDataTableProps) {
  const router = useRouter();
  const { widget, sourceData, multiSeriesData, stackedLabels, metricFormat, numericValues } = model;
  const dataSource = widget.dataSource;

  const tableRows = useMemo(() => {
    if (isComparisonMultiSeriesSource(dataSource)) {
      return multiSeriesData.map((row) => ({
        label: String(row.name ?? ""),
        values: [row.serieA, row.serieB] as const,
      }));
    }
    if (dataSource === "tickets_trend") {
      return sourceData.map((entry) => ({
        label: getEntryLabel(entry),
        values: [Number(entry.creados ?? 0), Number(entry.resueltos ?? 0)] as const,
      }));
    }
    if (dataSource === "sla_compliance") {
      return sourceData.map((entry) => ({
        label: getEntryLabel(entry),
        values: [Number(entry.cumplido ?? 0), Number(entry.incumplido ?? 0)] as const,
      }));
    }
    if (
      widget.chartType === "stacked_bar" ||
      widget.chartType === "stacked_area" ||
      widget.chartType === "composed"
    ) {
      return multiSeriesData.map((row) => ({
        label: String(row.name ?? ""),
        values: [row.serieA, row.serieB, row.serieC] as const,
      }));
    }
    return sourceData.map((entry, index) => ({
      label: getEntryLabel(entry) || `Item ${index + 1}`,
      values: [numericValues[index] ?? Number(entry.value ?? 0)] as const,
    }));
  }, [dataSource, multiSeriesData, numericValues, sourceData, widget.chartType]);

  if (tableRows.length === 0) return null;

  const isDualColumn =
    isComparisonMultiSeriesSource(dataSource) ||
    dataSource === "tickets_trend" ||
    dataSource === "sla_compliance";

  const isTripleStack =
    widget.chartType === "stacked_bar" ||
    widget.chartType === "stacked_area" ||
    widget.chartType === "composed";

  const total = numericValues.reduce((sum, value) => sum + value, 0);
  const tableCaption = caption ?? `Datos tabulares: ${widget.title}`;

  const colA =
    isComparisonMultiSeriesSource(dataSource)
      ? stackedLabels.serieA
      : dataSource === "sla_compliance"
        ? "En plazo"
        : dataSource === "tickets_trend"
          ? "Creados"
          : isTripleStack
            ? stackedLabels.serieA
            : "Valor";

  const colB =
    isComparisonMultiSeriesSource(dataSource)
      ? stackedLabels.serieB
      : dataSource === "sla_compliance"
        ? "Fuera de plazo"
        : dataSource === "tickets_trend"
          ? "Resueltos"
          : isTripleStack
            ? stackedLabels.serieB
            : null;

  return (
    <div className={cn("dashboard-chart-data-table mt-3 shrink-0", className)}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-3)]">
        Datos en tabla
      </p>
      <div className="max-h-40 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/45 [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[220px] border-collapse text-left text-[11px]">
          <caption className="sr-only">{tableCaption}</caption>
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/80">
              <th scope="col" className="px-2.5 py-1.5 font-semibold text-[var(--color-text-2)]">
                {dataSource === "tickets_trend" || dataSource === "sla_compliance" ? "Periodo" : "Categoría"}
              </th>
              <th scope="col" className="px-2.5 py-1.5 text-right font-semibold text-[var(--color-text-2)]">
                {colA}
              </th>
              {isDualColumn || isTripleStack ? (
                <th scope="col" className="px-2.5 py-1.5 text-right font-semibold text-[var(--color-text-2)]">
                  {colB}
                </th>
              ) : null}
              {isTripleStack ? (
                <th scope="col" className="px-2.5 py-1.5 text-right font-semibold text-[var(--color-text-2)]">
                  {stackedLabels.serieC}
                </th>
              ) : null}
              {!isDualColumn && !isTripleStack && total > 0 ? (
                <th scope="col" className="px-2.5 py-1.5 text-right font-semibold text-[var(--color-text-2)]">
                  %
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, index) => {
              const drillHref = getBandejaDrillHref(dataSource, row.label);
              const singleValue = row.values[0] ?? 0;
              const pct = !isDualColumn && !isTripleStack && total > 1e-9 ? ((singleValue / total) * 100).toFixed(1) : null;

              return (
                <tr
                  key={`${row.label}-${index}`}
                  className={cn(
                    "border-b border-[var(--color-border)]/60 last:border-b-0 hover:bg-[var(--color-surface-3)]/35",
                    drillHref && "cursor-pointer",
                  )}
                  onClick={
                    drillHref
                      ? () => {
                          router.push(drillHref);
                        }
                      : undefined
                  }
                  onKeyDown={
                    drillHref
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(drillHref);
                          }
                        }
                      : undefined
                  }
                  tabIndex={drillHref ? 0 : undefined}
                  role={drillHref ? "link" : undefined}
                  aria-label={drillHref ? `Abrir bandeja filtrada: ${row.label}` : undefined}
                >
                  <th scope="row" className="px-2.5 py-1.5 font-medium text-[var(--color-text-1)]">
                    {drillHref ? (
                      <Link
                        href={drillHref}
                        className="text-[var(--color-accent)] hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {truncateLabel(row.label)}
                      </Link>
                    ) : (
                      truncateLabel(row.label)
                    )}
                  </th>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-[var(--color-text-1)]">
                    {formatMetric(row.values[0] ?? 0, metricFormat)}
                  </td>
                  {isDualColumn || isTripleStack ? (
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-[var(--color-text-1)]">
                      {formatMetric(row.values[1] ?? 0, metricFormat)}
                    </td>
                  ) : null}
                  {isTripleStack ? (
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-[var(--color-text-1)]">
                      {formatMetric(row.values[2] ?? 0, metricFormat)}
                    </td>
                  ) : null}
                  {!isDualColumn && !isTripleStack && total > 0 ? (
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-[var(--color-text-3)]">
                      {pct != null ? `${pct}%` : "—"}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-[var(--color-text-3)]">{tableRows.length} filas</p>
    </div>
  );
}
