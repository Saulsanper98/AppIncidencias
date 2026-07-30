"use client";

import {
  Activity,
  AlertTriangle,
  Clock3,
  Gauge,
  Layers,
  Ticket,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatMetric } from "@/lib/dashboard/chart-theme";
import type { DashboardKpis } from "@/lib/dashboard/dashboard-data-types";

type KpiWidgetCardProps = {
  title: string;
  dataSource: string;
  kpis: DashboardKpis;
  accentColor: string;
  days: number;
  presentationMode?: boolean;
};

function formatDurationMs(ms: number | null): string {
  if (ms == null) return "—";
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(ms / (1000 * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

const KPI_ICONS: Record<string, LucideIcon> = {
  kpi_open_tickets: Ticket,
  kpi_active_incidents: Layers,
  kpi_sla_percent: Gauge,
  kpi_sla_vencidos: AlertTriangle,
  kpi_alta_prioridad: Zap,
  kpi_mttr: Clock3,
  kpi_fleet_availability: Truck,
  kpi_unassigned: Users,
  kpi_resolved_30d: Activity,
  kpi_created_today: Activity,
};

function resolveKpi(
  dataSource: string,
  kpis: DashboardKpis,
): { value: string; hint: string; tone?: "warn" | "ok"; label: string } {
  switch (dataSource) {
    case "kpi_open_tickets":
      return {
        label: "Abiertos",
        value: formatMetric(kpis.openTickets, "integer"),
        hint: "Estado abierto ahora",
        tone: kpis.openTickets > 20 ? "warn" : undefined,
      };
    case "kpi_sla_percent":
      return {
        label: "SLA",
        value: kpis.slaPercent != null ? `${kpis.slaPercent}%` : "—",
        hint: "Resueltos en plazo · 30 días",
        tone: kpis.slaPercent != null && kpis.slaPercent < 80 ? "warn" : "ok",
      };
    case "kpi_mttr":
      return { label: "MTTR", value: formatDurationMs(kpis.mttrMs), hint: "Tiempo medio · 30 días" };
    case "kpi_fleet_availability":
      return {
        label: "Flota",
        value: `${kpis.fleetAvailabilityPercent}%`,
        hint: "Buses sin incidencia activa",
        tone: kpis.fleetAvailabilityPercent < 90 ? "warn" : "ok",
      };
    case "kpi_unassigned":
      return {
        label: "Sin asignar",
        value: formatMetric(kpis.unassignedAged, "integer"),
        hint: "Activos · +30 min sin responsable",
        tone: kpis.unassignedAged > 0 ? "warn" : undefined,
      };
    case "kpi_resolved_30d":
      return { label: "Resueltos", value: formatMetric(kpis.resolved30d, "integer"), hint: "Cerrados · 30 días" };
    case "kpi_created_today":
      return { label: "Hoy", value: formatMetric(kpis.createdToday, "integer"), hint: "Registrados hoy" };
    case "kpi_active_incidents":
      return {
        label: "Activas",
        value: formatMetric(kpis.activeIncidents, "integer"),
        hint: "No resueltas ahora",
        tone: kpis.activeIncidents > 30 ? "warn" : undefined,
      };
    case "kpi_sla_vencidos":
      return {
        label: "SLA vencidos",
        value: formatMetric(kpis.slaVencidos, "integer"),
        hint: "Fuera de plazo · activos",
        tone: kpis.slaVencidos > 0 ? "warn" : "ok",
      };
    case "kpi_alta_prioridad":
      return {
        label: "Alta prioridad",
        value: formatMetric(kpis.altaPrioridad, "integer"),
        hint: "Activos · prioridad alta",
        tone: kpis.altaPrioridad > 0 ? "warn" : undefined,
      };
    default:
      return { label: "KPI", value: "—", hint: "KPI no configurado" };
  }
}

export function KpiWidgetCard({
  title,
  dataSource,
  kpis,
  accentColor,
  presentationMode,
}: KpiWidgetCardProps) {
  const kpi = resolveKpi(dataSource, kpis);
  const Icon = KPI_ICONS[dataSource] ?? Gauge;
  const toneColor = kpi.tone === "warn" ? "#F59E0B" : kpi.tone === "ok" ? "#059669" : accentColor;
  const isEmpty = kpi.value === "—";

  return (
    <div
      className={cn(
        "dashboard-kpi-card group flex h-full min-h-[140px] flex-col justify-between",
        presentationMode ? "p-5" : "p-4",
      )}
      style={{
        ["--kpi-accent" as string]: accentColor,
        ["--kpi-tone" as string]: toneColor,
      }}
    >
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-3)]",
              presentationMode && "text-[10px]",
            )}
          >
            {title || kpi.label}
          </p>
          <p
            key={kpi.value}
            className={cn(
              "dashboard-kpi-value dashboard-kpi-value--enter mt-2 font-semibold tabular-nums tracking-tight",
              presentationMode ? "text-4xl" : "text-[2rem] leading-none",
              isEmpty && "dashboard-kpi-value--empty",
            )}
          >
            {kpi.value}
          </p>
        </div>
        <div
          className="dashboard-kpi-icon-wrap flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
          style={{ color: toneColor }}
        >
          <Icon size={17} strokeWidth={1.85} aria-hidden />
        </div>
      </div>
      <p className="relative mt-3 text-[11px] leading-snug text-[var(--color-text-3)]">{kpi.hint}</p>
    </div>
  );
}
