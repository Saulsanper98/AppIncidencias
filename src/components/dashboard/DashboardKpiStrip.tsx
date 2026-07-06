"use client";

import type { KpiInlineStripItem } from "@/components/ui/kpi-inline-strip";
import { KpiInlineStrip } from "@/components/ui/kpi-inline-strip";
import type { KpiTone } from "@/components/ui/kpi-pill";
import { cn } from "@/lib/utils";

import type { KpisData } from "./dashboard-types";

function formatMttr(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function slaMinutesRemaining(deadlineIso: string): number {
  return Math.round((new Date(deadlineIso).getTime() - Date.now()) / 60000);
}

export function getDashboardCriticalCounts(loading: boolean, kpis: KpisData | null) {
  if (loading || !kpis) {
    return { slaVencidos: 0, altaPrioridad: 0 };
  }
  return {
    slaVencidos: kpis.incidenciasActivas.filter((t) => slaMinutesRemaining(t.slaDeadline) <= 0).length,
    altaPrioridad: kpis.incidenciasActivas.filter((t) => t.priority === "alta").length,
  };
}

export function buildDashboardKpiItems(loading: boolean, kpis: KpisData | null): KpiInlineStripItem[] {
  const abiertos = loading ? undefined : (kpis?.ticketsAbiertos ?? null);
  const flota = loading ? undefined : (kpis?.fleetAvailabilityPercent ?? null);
  const slaPct = loading ? undefined : (kpis?.slaCompliancePercent ?? null);
  const unassigned = loading ? undefined : (kpis?.unassignedAgedCount ?? 0);

  return [
    {
      key: "abiertos",
      label: "Abiertos",
      value: abiertos ?? null,
      tone: ((abiertos ?? 0) > 10 ? "warning" : "accent") as KpiTone,
      title: kpis ? `${kpis.resolvedCount30d} resueltos en 30d` : undefined,
      href: "/bandeja",
      loading,
    },
    {
      key: "flota",
      label: "Flota",
      value: flota ?? null,
      suffix: typeof flota === "number" ? "%" : undefined,
      tone: ((flota ?? 100) >= 90 ? "success" : "error") as KpiTone,
      title: "Porcentaje de buses sin incidencia activa",
      loading,
    },
    {
      key: "sla-pct",
      label: "SLA",
      value: slaPct ?? null,
      suffix: typeof slaPct === "number" ? "%" : undefined,
      tone: slaPct == null ? "neutral" : slaPct >= 85 ? "success" : "error",
      title: "Cumplimiento SLA últimos 30 días",
      loading,
      emptyHint: "Sin tickets resueltos para calcular SLA",
    },
    {
      key: "mttr",
      label: "MTTR",
      value: loading ? undefined : formatMttr(kpis?.mttrMs ?? null),
      tone: "neutral",
      title: "Tiempo medio de resolución (30d)",
      loading,
      emptyHint: "Sin tickets resueltos en 30d",
    },
    {
      key: "resueltos-30d",
      label: "Res. 30d",
      value: loading ? undefined : (kpis?.resolvedCount30d ?? null),
      tone: "success",
      title: "Tickets resueltos en los últimos 30 días",
      loading,
    },
    {
      key: "sin-asignar",
      label: "Sin asign.",
      value: unassigned ?? null,
      tone: (unassigned ?? 0) > 0 ? "warning" : "neutral",
      pulse: (unassigned ?? 0) > 0,
      title: "Tickets abiertos sin asignar más de 30 min",
      href: "/bandeja?status=abierto",
      loading,
    },
  ];
}

export function DashboardKpiStrip({
  loading,
  kpis,
  className,
}: {
  loading: boolean;
  kpis: KpisData | null;
  className?: string;
}) {
  const items = buildDashboardKpiItems(loading, kpis);

  return (
    <KpiInlineStrip
      items={items}
      className={cn("min-w-0 flex-1", className)}
      ariaLabel="Indicadores operativos"
    />
  );
}
