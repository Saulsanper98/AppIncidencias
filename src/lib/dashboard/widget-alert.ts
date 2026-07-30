import type { CustomDashboardData } from "@/lib/dashboard/dashboard-data-types";

export type WidgetAlertTone = "warn" | "error" | null;

/** Umbrales operativos para resaltar widgets en riesgo. */
export function resolveWidgetAlertTone(
  dataSource: string,
  data: CustomDashboardData,
): WidgetAlertTone {
  const k = data.kpis;
  switch (dataSource) {
    case "kpi_open_tickets":
      if (k.openTickets > 40) return "error";
      if (k.openTickets > 20) return "warn";
      return null;
    case "kpi_active_incidents":
      if (k.activeIncidents > 50) return "error";
      if (k.activeIncidents > 30) return "warn";
      return null;
    case "kpi_sla_percent":
      if (k.slaPercent != null && k.slaPercent < 70) return "error";
      if (k.slaPercent != null && k.slaPercent < 80) return "warn";
      return null;
    case "kpi_sla_vencidos":
      if (k.slaVencidos > 5) return "error";
      if (k.slaVencidos > 0) return "warn";
      return null;
    case "kpi_alta_prioridad":
      if (k.altaPrioridad > 8) return "error";
      if (k.altaPrioridad > 0) return "warn";
      return null;
    case "kpi_unassigned":
      if (k.unassignedAged > 5) return "error";
      if (k.unassignedAged > 0) return "warn";
      return null;
    case "kpi_fleet_availability":
      if (k.fleetAvailabilityPercent < 80) return "error";
      if (k.fleetAvailabilityPercent < 90) return "warn";
      return null;
    case "embed_sla_urgent":
    case "sla_urgent_tickets":
      if (data.sla_urgent_tickets.length > 5) return "error";
      if (data.sla_urgent_tickets.length > 0) return "warn";
      return null;
    case "anomalous_buses":
      if (data.anomalous_buses.length > 8) return "error";
      if (data.anomalous_buses.length > 3) return "warn";
      return null;
    default:
      return null;
  }
}
