"use client";

import { useCallback } from "react";

import Link from "next/link";

import { formatMetric, type MetricFormat } from "@/lib/dashboard/chart-theme";
import {
  getBandejaDrillHref,
  isTicketDistributionSource,
  resolveSeriesLabel,
  TOOLTIP_AUXILIARY_SERIES_KEYS,
  isStaggerBarSeriesKey,
} from "@/lib/dashboard/widget-data-helpers";
import { cn } from "@/lib/utils";

import {
  getTrailingMovingAverageBefore,
  MiniSparkline,
  resolveTooltipContext,
} from "./chart-utils.impl";
import type { DataEntry, ExecutiveTooltipProps } from "./types";

export type ExecutiveTooltipFactoryParams = {
  accentColor: string;
  metricFormat: MetricFormat;
  numericValues: number[];
  sourceData: DataEntry[];
  dataSource: string;
};

export function createExecutiveTooltipContent({
  accentColor,
  metricFormat,
  numericValues,
  sourceData,
  dataSource,
}: ExecutiveTooltipFactoryParams) {
  return function ExecutiveTooltipContent(props: unknown) {
    const { active, payload, label } = props as ExecutiveTooltipProps;
    if (!active || !payload || payload.length === 0) return null;
    const ticketDist = isTicketDistributionSource(dataSource);
    const seriesPayload = payload.filter((item) => {
      const key = String(item.dataKey ?? "");
      if (TOOLTIP_AUXILIARY_SERIES_KEYS.has(key)) return false;
      if (isStaggerBarSeriesKey(key)) {
        const value = typeof item.value === "number" ? item.value : Number(item.value ?? 0);
        return value > 0;
      }
      return true;
    });
    const effectivePayload = seriesPayload.length > 0 ? seriesPayload : payload;
    const { title: tooltipTitle, rowIndex: tooltipRowIndex } = resolveTooltipContext(
      label,
      effectivePayload,
      sourceData,
      dataSource,
    );
    const primaryCurrent =
      tooltipRowIndex >= 0
        ? numericValues[tooltipRowIndex] ?? 0
        : typeof payload[0]?.value === "number"
          ? payload[0].value
          : Number(payload[0]?.value ?? 0);
    const totalAgg = numericValues.reduce((s, v) => s + v, 0);
    const sharePct =
      ticketDist && totalAgg > 1e-9 && tooltipRowIndex >= 0
        ? ((primaryCurrent / totalAgg) * 100).toFixed(1)
        : null;
    const shareBlock =
      sharePct != null ? (
        <p className="mt-1 text-[10px] text-[var(--color-text-3)]">
          {sharePct}% del total ({formatMetric(totalAgg, metricFormat)})
        </p>
      ) : null;

    const drillHref = getBandejaDrillHref(dataSource, String(tooltipTitle));
    const drillBlock =
      drillHref != null ? (
        <Link
          href={drillHref}
          className="mt-2 inline-flex text-[11px] font-medium text-[var(--color-accent)] hover:underline"
        >
          Abrir en bandeja →
        </Link>
      ) : null;

    const ma = getTrailingMovingAverageBefore(numericValues, tooltipRowIndex);
    const maWindow = tooltipRowIndex >= 1 ? Math.min(5, tooltipRowIndex) : 0;
    let deltaVsMa: number | null = null;
    if (!ticketDist && tooltipRowIndex >= 1 && ma != null && Math.abs(ma) > 1e-9) {
      deltaVsMa = ((primaryCurrent - ma) / ma) * 100;
    }
    const isUp = deltaVsMa != null && deltaVsMa >= 0;
    const deltaBlock =
      !ticketDist && tooltipRowIndex >= 1 && deltaVsMa != null && Number.isFinite(deltaVsMa) ? (
        <p className={cn("mt-1 text-[10px] font-medium", isUp ? "text-emerald-400" : "text-rose-400")}>
          {isUp ? "▲" : "▼"} {Math.abs(deltaVsMa).toFixed(1)}% vs media móvil ({maWindow} pts)
        </p>
      ) : !ticketDist && tooltipRowIndex >= 1 && ma != null && Math.abs(ma) <= 1e-9 ? (
        <p className="mt-1 text-[10px] text-[var(--color-text-3)]">Referencia MA ~ 0 (sin delta %)</p>
      ) : null;

    if (effectivePayload.length > 1) {
      const rowSeriesValues = effectivePayload.map((p) => Number(p.value ?? 0));
      const stackTotal = rowSeriesValues.reduce((s, v) => (Number.isFinite(v) ? s + v : s), 0);
      let stackHighlightIdx = 0;
      let stackMax = -Infinity;
      rowSeriesValues.forEach((v, i) => {
        if (Number.isFinite(v) && v > stackMax) {
          stackMax = v;
          stackHighlightIdx = i;
        }
      });
      return (
        <div
          className="dashboard-executive-tooltip"
          style={{ ["--chart-accent" as string]: accentColor }}
        >
          <div className="dashboard-executive-tooltip__accent" />
          <div className="dashboard-executive-tooltip__body">
            <p className="dashboard-executive-tooltip__title">{tooltipTitle}</p>
            <div className="max-h-36 space-y-1 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
              {effectivePayload.map((item, idx) => (
                <div key={`${String(item.dataKey)}-${idx}`} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-[var(--color-text-3)]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color ?? "#94a3b8" }} />
                    <span className="truncate">{resolveSeriesLabel(item, dataSource)}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-[var(--color-text-1)]">
                    {formatMetric(item.value as number | string, metricFormat)}
                  </span>
                </div>
              ))}
            </div>
            {stackTotal > 1e-9 ? (
              <div className="mt-1.5 space-y-1 border-t border-[var(--color-border)] pt-1.5">
                <p className="text-[10px] font-medium text-[var(--color-text-2)]">
                  Total: {formatMetric(stackTotal, metricFormat)}
                </p>
                <div className="max-h-24 space-y-0.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
                  {effectivePayload.map((item, idx) => {
                    const v = Number(item.value ?? 0);
                    const pct = stackTotal > 1e-9 ? ((v / stackTotal) * 100).toFixed(1) : "0.0";
                    return (
                      <p key={`pct-${String(item.dataKey)}-${idx}`} className="text-[10px] text-[var(--color-text-3)] tabular-nums">
                        {resolveSeriesLabel(item, dataSource)}: {pct}%
                      </p>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <MiniSparkline
              values={rowSeriesValues.length >= 2 ? rowSeriesValues : numericValues}
              highlightIndex={rowSeriesValues.length >= 2 ? stackHighlightIdx : tooltipRowIndex >= 0 ? tooltipRowIndex : 0}
              accentColor={accentColor}
            />
            {drillBlock}
          </div>
        </div>
      );
    }

    const raw = effectivePayload[0]?.value;
    const current = typeof raw === "number" ? raw : Number(raw ?? 0);
    return (
      <div
        className="dashboard-executive-tooltip"
        style={{ ["--chart-accent" as string]: accentColor }}
      >
        <div className="dashboard-executive-tooltip__accent" />
        <div className="dashboard-executive-tooltip__body">
          <p className="dashboard-executive-tooltip__title">{tooltipTitle}</p>
          <p className="text-[10px] text-[var(--color-text-3)]">
            {resolveSeriesLabel(effectivePayload[0] ?? {}, dataSource)}
          </p>
          <p className="dashboard-executive-tooltip__value">{formatMetric(current, metricFormat)}</p>
          <MiniSparkline
            values={numericValues}
            highlightIndex={tooltipRowIndex >= 0 ? tooltipRowIndex : 0}
            accentColor={accentColor}
          />
          {shareBlock}
          {deltaBlock}
          {drillBlock}
        </div>
      </div>
    );
  };
}

/** Hook wrapper for stable tooltip content reference in chart widgets. */
export function useExecutiveTooltipContent(params: ExecutiveTooltipFactoryParams) {
  const { accentColor, metricFormat, numericValues, sourceData, dataSource } = params;
  return useCallback(
    createExecutiveTooltipContent({ accentColor, metricFormat, numericValues, sourceData, dataSource }),
    [accentColor, metricFormat, numericValues, sourceData, dataSource],
  );
}
