"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Ref } from "react";
import { Copy, Download, Eye, EyeOff, Pencil, RotateCcw, Wand2, X } from "lucide-react";

import { ChartDataTable } from "@/components/dashboard-builder/chart-data-table";
import { ChartEmptyState } from "@/components/dashboard-builder/chart-empty-state";
import {
  getChartEntryAnimationClass,
  getTransitionByWidgetSize,
  OPERATION_QUICK_LINKS,
  buildChartA11ySummary,
} from "@/components/dashboard-builder/charts/chart-utils";
import type { ChartParsedConfig } from "@/components/dashboard-builder/charts/types";
import { useChartWidgetModel } from "@/components/dashboard-builder/charts/use-chart-widget-model";
import { KpiWidgetCard } from "@/components/dashboard-builder/kpi-widget-card";
import { WidgetCardFrame } from "@/components/dashboard-builder/widget-card-frame";
import { DashboardHealthWidget } from "@/components/dashboard-embeds/dashboard-health-widget";
import { DesviosCompactWidget } from "@/components/dashboard-embeds/desvios-compact-widget";
import { HandoverCompactWidget } from "@/components/dashboard-embeds/handover-compact-widget";
import { SlaUrgentListWidget } from "@/components/dashboard-embeds/sla-urgent-list-widget";
import { DashboardPreventiveAgenda } from "@/components/dashboard-preventive-agenda";
import { TicketsBandejaWidget } from "@/components/dashboard-embeds/tickets-bandeja-widget";
import type { CustomDashboardData } from "@/lib/dashboard/dashboard-data-types";
import { isKpiDataSource } from "@/lib/dashboard/data-sources";
import { deriveWidgetDensity, isCompactWidgetHeader, isHighDensityLayout } from "@/lib/dashboard/widget-density";
import { parseWidgetLayout } from "@/lib/dashboard/widget-layout";
import { getEmptyStateBySource, LEGACY_EMBED_MIGRATIONS, QUICK_DATA_SOURCES } from "@/lib/dashboard/widget-data-helpers";
import { resolveWidgetAlertTone } from "@/lib/dashboard/widget-alert";
import { cn } from "@/lib/utils";
import type { ChartType } from "@/lib/dashboard/chart-types";

/** Recharts es pesado: carga diferida al montar el widget de gráfico. */
const ChartWidgetBody = dynamic(
  () =>
    import("@/components/dashboard-builder/charts/chart-widget-body").then((m) => m.ChartWidgetBody),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center text-xs text-[var(--color-text-3)]">
        Cargando gráfico…
      </div>
    ),
  },
);

type WidgetRendererProps = {
  widget: {
    id: string;
    title: string;
    chartType: ChartType;
    dataSource: string;
    size: string;
    config: string;
  };
  data: CustomDashboardData;
  days?: number;
  isEditing?: boolean;
  onRemove?: (id: string) => void;
  onRequestEdit?: () => void;
  onDuplicate?: (id: string) => void;
  onQuickToggleLegend?: (id: string) => void;
  onQuickCycleChartType?: (id: string) => void;
  onQuickResetVisual?: (id: string) => void;
  onQuickChangeSource?: (id: string, dataSource: string) => void;
  onMigrateLegacySource?: (id: string, dataSource: string, title: string) => void;
  presentationMode?: boolean;
  animationDelayMs?: number;
  dashboardId?: string;
  exportRootRef?: Ref<HTMLDivElement | null>;
  isKeyboardFocused?: boolean;
  onWidgetPaneMouseDown?: () => void;
  onExportWidget?: () => void;
  chartHeight?: number;
};

export function WidgetRenderer({
  widget,
  data,
  days,
  isEditing,
  onRemove,
  onRequestEdit,
  onDuplicate,
  onQuickToggleLegend,
  onQuickCycleChartType,
  onQuickResetVisual,
  onQuickChangeSource,
  onMigrateLegacySource,
  presentationMode = false,
  animationDelayMs = 0,
  dashboardId,
  exportRootRef,
  isKeyboardFocused = false,
  onWidgetPaneMouseDown,
  onExportWidget,
  chartHeight,
}: WidgetRendererProps) {
  const parsedConfig = useMemo<ChartParsedConfig>(() => {
    try {
      return JSON.parse(widget.config ?? "{}") as ChartParsedConfig;
    } catch {
      return {};
    }
  }, [widget.config]);

  const widgetLayout = useMemo(
    () => parseWidgetLayout(widget.config ?? "{}", widget.size),
    [widget.config, widget.size],
  );
  const density = deriveWidgetDensity(widgetLayout);
  const isHighDensity = isHighDensityLayout(widgetLayout);
  const compactHeader = isCompactWidgetHeader(widgetLayout) || isHighDensity;
  const legendVisible = parsedConfig.showLegend ?? true;

  const chartModel = useChartWidgetModel({ widget, data, chartHeight, parsedConfig });
  const {
    accentColor,
    dataSourceLabel,
    dataSourceMicrocopy,
    cardInsightLine,
    sourceData,
    numericValues,
    metricFormat,
    responsiveChartHeight,
    isHighDensity: chartHighDensity,
  } = chartModel;

  const chartTooSmall = responsiveChartHeight < 80;

  const emptyState = getEmptyStateBySource(widget.dataSource);
  const transitionBySize = getTransitionByWidgetSize(density, presentationMode);
  const [isTransitioning, setIsTransitioning] = useState(presentationMode);

  const cardPaddingClass =
    density === "small" ? "p-3" : density === "large" ? (presentationMode ? "p-7" : "p-6") : "p-4";

  const a11ySummaryId = useMemo(() => `widget-a11y-${widget.id}`, [widget.id]);
  const a11ySummaryText = useMemo(
    () =>
      buildChartA11ySummary({
        title: widget.title,
        dataSourceLabel,
        dataSourceMicrocopy,
        sourceData,
        numericValues,
        metricFormat,
        cardInsightLine,
      }),
    [widget.title, dataSourceLabel, dataSourceMicrocopy, sourceData, numericValues, metricFormat, cardInsightLine],
  );

  const feedbackTarget = useMemo(
    () =>
      dashboardId
        ? {
            id: `dashboards/${dashboardId}/widget/${widget.id}`,
            label: `${widget.title} · ${dataSourceLabel}`,
          }
        : null,
    [dashboardId, widget.id, widget.title, dataSourceLabel],
  );

  const alertTone = useMemo(() => resolveWidgetAlertTone(widget.dataSource, data), [widget.dataSource, data]);

  useEffect(() => {
    setIsTransitioning(true);
    const timeout = setTimeout(() => setIsTransitioning(false), transitionBySize.durationMs);
    return () => clearTimeout(timeout);
  }, [
    widget.chartType,
    widget.size,
    widget.config,
    widget.dataSource,
    sourceData.length,
    transitionBySize.durationMs,
    presentationMode,
  ]);

  const widgetInnerClass = cn("flex h-full min-h-0 flex-col", cardPaddingClass);

  const entryAnimationClass = cn(
    isTransitioning
      ? cn(transitionBySize.transitionOpacityClass, getChartEntryAnimationClass(widget.chartType, density, presentationMode))
      : "opacity-100 translate-y-0 translate-x-0 scale-100",
    presentationMode && isTransitioning && "dashboard-widget-presentation-enter",
  );

  const transitionWrapperClass = cn(
    "transition-all will-change-transform",
    transitionBySize.className,
    entryAnimationClass,
  );

  const shellProps = {
    accentColor,
    exportRootRef,
    presentationMode,
    isEditing,
    isKeyboardFocused,
    onMouseDown: () => onWidgetPaneMouseDown?.(),
    "aria-label": widget.title,
    feedbackTarget,
    hideFeedback: presentationMode,
    alertTone,
  } as const;

  const embedHeader = (
    <div
      className={cn(
        "shrink-0 border-b border-[var(--color-border)] flex items-start justify-between",
        compactHeader ? "mb-2 pb-2" : "mb-3 pb-3",
        presentationMode && "pb-2",
        feedbackTarget && !presentationMode && "pr-9",
      )}
    >
      <div className="min-w-0">
        <h3
          className={cn(
            "truncate text-subheading",
            isEditing && "pl-5",
            presentationMode && "text-[15px]",
            compactHeader && "text-[13px]",
          )}
        >
          {widget.title}
        </h3>
        {!compactHeader ? (
          <>
            <p className={cn("text-caption text-[var(--color-text-3)] mt-1", isEditing && "pl-5")}>{dataSourceLabel}</p>
            {cardInsightLine ? (
              <p className={cn("text-[10px] text-[var(--color-text-2)] mt-1 leading-snug", isEditing && "pl-5")}>
                {cardInsightLine}
              </p>
            ) : null}
          </>
        ) : cardInsightLine ? (
          <p className={cn("mt-0.5 truncate text-[10px] text-[var(--color-text-3)]", isEditing && "pl-5")}>
            {cardInsightLine}
          </p>
        ) : null}
      </div>
      <div className={cn("flex items-center gap-2", presentationMode && "hidden")}>
        {isEditing && onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(widget.id)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-all"
            title="Eliminar widget"
            aria-label={`Eliminar widget ${widget.title}`}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );

  if (widget.chartType === "kpi" || isKpiDataSource(widget.dataSource)) {
    return (
      <WidgetCardFrame {...shellProps} className="dashboard-widget-card--kpi">
        <div style={{ transitionDelay: `${animationDelayMs}ms` }} className={transitionWrapperClass}>
          <KpiWidgetCard
            title={widget.title}
            dataSource={widget.dataSource}
            kpis={data.kpis}
            accentColor={accentColor}
            days={days ?? data.days}
            presentationMode={presentationMode}
          />
        </div>
      </WidgetCardFrame>
    );
  }

  if (widget.dataSource === "embed_tickets") {
    return (
      <WidgetCardFrame {...shellProps}>
        <div className={widgetInnerClass}>
          {embedHeader}
          <div className="min-h-0 flex-1 overflow-auto [-webkit-overflow-scrolling:touch]">
            <TicketsBandejaWidget />
          </div>
        </div>
      </WidgetCardFrame>
    );
  }

  if (widget.dataSource === "embed_map") {
    const migrationOptions = LEGACY_EMBED_MIGRATIONS.embed_map;
    return (
      <WidgetCardFrame {...shellProps}>
        <div className={widgetInnerClass}>
          {embedHeader}
          <div className="min-h-0 flex-1 space-y-4 p-2 text-sm leading-relaxed text-[var(--color-text-2)]">
            <p>
              El mapa embebido ya no está disponible en dashboards. Puedes abrir la{" "}
              <Link className="font-medium text-[var(--color-accent)] underline-offset-2 hover:underline" href="/mapa">
                pantalla Mapa
              </Link>{" "}
              o migrar este widget con un clic.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {migrationOptions.map((option) => (
                <button
                  key={option.dataSource}
                  type="button"
                  onClick={() => onMigrateLegacySource?.(widget.id, option.dataSource, option.title)}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left transition-colors hover:border-[color-mix(in_oklab,var(--color-border)_55%,var(--color-accent)_45%)] hover:bg-[var(--color-surface-3)]"
                >
                  <span className="block text-sm font-medium text-[var(--color-accent)]">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--color-text-3)]">{option.hint}</span>
                </button>
              ))}
            </div>
            {isEditing && onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(widget.id)}
                className="text-[11px] text-[var(--color-text-3)] underline-offset-2 hover:text-[var(--color-error)] hover:underline"
              >
                Eliminar widget obsoleto
              </button>
            ) : null}
          </div>
        </div>
      </WidgetCardFrame>
    );
  }

  if (widget.dataSource === "embed_preventive") {
    return (
      <WidgetCardFrame {...shellProps}>
        <div className={widgetInnerClass}>
          {embedHeader}
          <div className="max-h-[min(420px,55vh)] min-h-0 flex-1 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch]">
            <DashboardPreventiveAgenda />
          </div>
        </div>
      </WidgetCardFrame>
    );
  }

  if (widget.dataSource === "embed_desvios") {
    return (
      <WidgetCardFrame {...shellProps}>
        <div className={widgetInnerClass}>
          {embedHeader}
          <div className="min-h-0 flex-1 overflow-auto">
            <DesviosCompactWidget />
          </div>
        </div>
      </WidgetCardFrame>
    );
  }

  if (widget.dataSource === "embed_health") {
    return (
      <WidgetCardFrame {...shellProps}>
        <div className={widgetInnerClass}>
          {embedHeader}
          <DashboardHealthWidget />
        </div>
      </WidgetCardFrame>
    );
  }

  if (widget.dataSource === "embed_handover") {
    return (
      <WidgetCardFrame {...shellProps}>
        <div className={widgetInnerClass}>
          {embedHeader}
          <HandoverCompactWidget />
        </div>
      </WidgetCardFrame>
    );
  }

  if (widget.dataSource === "embed_sla_urgent") {
    return (
      <WidgetCardFrame {...shellProps}>
        <div className={widgetInnerClass}>
          {embedHeader}
          <SlaUrgentListWidget tickets={data.sla_urgent_tickets} />
        </div>
      </WidgetCardFrame>
    );
  }

  if (widget.dataSource === "operation_links") {
    return (
      <WidgetCardFrame {...shellProps}>
        <div className={widgetInnerClass}>
          {embedHeader}
          <ul className="grid gap-2 sm:grid-cols-2">
            {OPERATION_QUICK_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm text-[var(--color-text-1)] transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)]"
                >
                  <span className="font-medium text-[var(--color-accent)]">{item.label}</span>
                  <span className="text-[11px] text-[var(--color-text-3)]">{item.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </WidgetCardFrame>
    );
  }

  if (!sourceData || sourceData.length === 0) {
    return (
      <WidgetCardFrame {...shellProps} aria-describedby={a11ySummaryId}>
        <div className={widgetInnerClass}>
          {embedHeader}
          <ChartEmptyState title={emptyState.title} action={emptyState.action}>
            {isEditing && onQuickChangeSource ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-[280px]">
                {QUICK_DATA_SOURCES.filter((source) => source.id !== widget.dataSource).map((source) => (
                  <button
                    key={source.id}
                    onClick={() => onQuickChangeSource(widget.id, source.id)}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)] hover:border-[var(--color-border-hover)] transition-all"
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            ) : null}
            {!isEditing && onRequestEdit ? (
              <button
                onClick={onRequestEdit}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)] hover:border-[var(--color-border-hover)] transition-all"
              >
                Editar widget
              </button>
            ) : null}
          </ChartEmptyState>
          <span id={a11ySummaryId} className="sr-only">
            {a11ySummaryText}
          </span>
        </div>
      </WidgetCardFrame>
    );
  }

  return (
    <WidgetCardFrame {...shellProps} aria-describedby={a11ySummaryId}>
      <div className={widgetInnerClass}>
        <div
          className={cn(
            "dashboard-widget-header shrink-0 border-b border-[var(--color-border)] flex items-start justify-between",
            compactHeader ? "mb-2 pb-2" : "mb-3 pb-3",
            presentationMode && "pb-2",
            feedbackTarget && !presentationMode && "pr-9",
          )}
        >
          <div className="min-w-0">
            <h3 className={cn("truncate text-subheading", isEditing && "pl-5", presentationMode && "text-[15px]", compactHeader && "text-[13px]")}>
              {widget.title}
            </h3>
            {!compactHeader ? (
              <>
                <p className={cn("text-caption text-[var(--color-text-3)] mt-1", isEditing && "pl-5")}>{dataSourceLabel}</p>
                {cardInsightLine ? (
                  <p className={cn("text-[10px] text-[var(--color-text-2)] mt-1.5 leading-snug", isEditing && "pl-5")}>
                    {cardInsightLine}
                  </p>
                ) : null}
              </>
            ) : cardInsightLine ? (
              <p className={cn("mt-0.5 truncate text-[10px] text-[var(--color-text-3)]", isEditing && "pl-5")}>{cardInsightLine}</p>
            ) : null}
          </div>
          <div className={cn("flex items-center gap-2", presentationMode && "hidden")}>
            {isEditing && onRemove ? (
              <button
                onClick={() => onRemove(widget.id)}
                className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-all"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>
        {isEditing && !presentationMode ? (
          <div className="mb-2 flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/90 p-1 backdrop-blur-sm">
            {onRequestEdit ? (
              <button
                type="button"
                onClick={onRequestEdit}
                className="rounded-md p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                aria-label="Editar widget"
                title="Editar widget"
              >
                <Pencil size={13} />
              </button>
            ) : null}
            <button
              onClick={() => onDuplicate?.(widget.id)}
              className="rounded-md p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              aria-label="Duplicar widget"
              title="Duplicar widget"
            >
              <Copy size={13} />
            </button>
            <button
              onClick={() => onQuickToggleLegend?.(widget.id)}
              className="rounded-md p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              aria-label="Alternar leyenda"
              title={legendVisible ? "Ocultar leyenda" : "Mostrar leyenda"}
            >
              {legendVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button
              onClick={() => onQuickCycleChartType?.(widget.id)}
              className="rounded-md p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              aria-label="Cambiar tipo grafico"
              title="Cambiar tipo de gráfica"
            >
              <Wand2 size={13} />
            </button>
            <button
              onClick={() => onQuickResetVisual?.(widget.id)}
              className="rounded-md p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              aria-label="Reset visual"
              title="Restaurar estilo visual"
            >
              <RotateCcw size={13} />
            </button>
            {onExportWidget ? (
              <button
                type="button"
                onClick={() => onExportWidget()}
                className="rounded-md p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                aria-label="Exportar widget PNG"
                title="Exportar PNG"
              >
                <Download size={13} />
              </button>
            ) : null}
          </div>
        ) : null}
        <div
          style={{ transitionDelay: `${animationDelayMs}ms` }}
          className={transitionWrapperClass}
        >
          {chartTooSmall ? (
            <div className="flex min-h-[72px] flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-6 text-center">
              <p className="text-caption text-[var(--color-text-3)]">
                Gráfica demasiado baja. Arrastra el borde inferior del widget para ampliarla.
              </p>
            </div>
          ) : (
            <>
              <ChartWidgetBody model={chartModel} />
              {!presentationMode && !chartHighDensity ? (
                <ChartDataTable model={chartModel} />
              ) : (
                <div className="sr-only">
                  <ChartDataTable model={chartModel} />
                </div>
              )}
            </>
          )}
        </div>
        <span id={a11ySummaryId} className="sr-only">
          {a11ySummaryText}
        </span>
      </div>
    </WidgetCardFrame>
  );
}
