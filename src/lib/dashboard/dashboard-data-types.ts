export type NamedValue = { name: string; value: number };

export type SlaDayRow = { day: string; cumplido: number; incumplido: number };

export type TrendDayRow = { day: string; creados: number; resueltos: number };

export type SlaUrgentTicket = {
  id: string;
  title: string;
  busId: string;
  slaDeadline: string;
  minutesLeft: number;
};

export type DashboardKpis = {
  openTickets: number;
  activeIncidents: number;
  slaPercent: number | null;
  mttrMs: number | null;
  fleetAvailabilityPercent: number;
  unassignedAged: number;
  resolved30d: number;
  createdToday: number;
  slaVencidos: number;
  altaPrioridad: number;
};

/** Totales del periodo seleccionado vs el periodo inmediatamente anterior (misma duración). */
export type DashboardPeriodComparison = {
  days: number;
  currentCreated: number;
  previousCreated: number;
  currentResolved: number;
  previousResolved: number;
};

export type CustomDashboardData = {
  days: number;
  generatedAt: string;
  kpis: DashboardKpis;
  periodComparison: DashboardPeriodComparison;
  tickets_by_status: NamedValue[];
  backlog_by_status: NamedValue[];
  tickets_by_operator: NamedValue[];
  tickets_by_priority: NamedValue[];
  tickets_by_municipio: NamedValue[];
  top_buses: NamedValue[];
  shift_load_today: NamedValue[];
  sla_compliance: SlaDayRow[];
  tickets_trend: TrendDayRow[];
  tickets_by_hour: NamedValue[];
  mttr_by_priority: NamedValue[];
  top_tecnicos: NamedValue[];
  shift_comparison: NamedValue[];
  anomalous_buses: NamedValue[];
  sla_urgent_tickets: SlaUrgentTicket[];
};

export const EMPTY_DASHBOARD_DATA: CustomDashboardData = {
  days: 7,
  generatedAt: "",
  kpis: {
    openTickets: 0,
    activeIncidents: 0,
    slaPercent: null,
    mttrMs: null,
    fleetAvailabilityPercent: 100,
    unassignedAged: 0,
    resolved30d: 0,
    createdToday: 0,
    slaVencidos: 0,
    altaPrioridad: 0,
  },
  periodComparison: {
    days: 7,
    currentCreated: 0,
    previousCreated: 0,
    currentResolved: 0,
    previousResolved: 0,
  },
  tickets_by_status: [],
  backlog_by_status: [],
  tickets_by_operator: [],
  tickets_by_priority: [],
  tickets_by_municipio: [],
  top_buses: [],
  shift_load_today: [],
  sla_compliance: [],
  tickets_trend: [],
  tickets_by_hour: [],
  mttr_by_priority: [],
  top_tecnicos: [],
  shift_comparison: [],
  anomalous_buses: [],
  sla_urgent_tickets: [],
};

/** Fusiona un payload parcial sobre datos previos o vacíos (seguro para cliente). */
export function mergeDashboardData(
  base: CustomDashboardData | null,
  patch: Partial<CustomDashboardData>,
): CustomDashboardData {
  return { ...(base ?? EMPTY_DASHBOARD_DATA), ...patch };
}
