export type NamedValue = { name: string; value: number };

export type SlaDayRow = { day: string; cumplido: number; incumplido: number };

export type TrendDayRow = { day: string; creados: number; resueltos: number };

export type DashboardKpis = {
  openTickets: number;
  slaPercent: number | null;
  mttrMs: number | null;
  fleetAvailabilityPercent: number;
  unassignedAged: number;
  resolved30d: number;
  createdToday: number;
};

export type CustomDashboardData = {
  days: number;
  generatedAt: string;
  kpis: DashboardKpis;
  tickets_by_status: NamedValue[];
  backlog_by_status: NamedValue[];
  tickets_by_operator: NamedValue[];
  tickets_by_priority: NamedValue[];
  tickets_by_municipio: NamedValue[];
  top_buses: NamedValue[];
  shift_load_today: NamedValue[];
  sla_compliance: SlaDayRow[];
  tickets_trend: TrendDayRow[];
};

export const EMPTY_DASHBOARD_DATA: CustomDashboardData = {
  days: 7,
  generatedAt: "",
  kpis: {
    openTickets: 0,
    slaPercent: null,
    mttrMs: null,
    fleetAvailabilityPercent: 100,
    unassignedAged: 0,
    resolved30d: 0,
    createdToday: 0,
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
};
