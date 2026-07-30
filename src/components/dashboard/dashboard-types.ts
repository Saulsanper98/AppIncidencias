export type ActiveIncident = {
  id: string;
  busId: string;
  operator: string;
  assetType: string;
  status: "abierto" | "en_proceso" | "esperando_repuesto";
  priority: "alta" | "media" | "baja";
  slaDeadline: string;
  title: string;
};

export type KpisData = {
  ticketsAbiertos: number;
  slaCompliancePercent: number | null;
  mttrMs: number | null;
  fleetAvailabilityPercent: number;
  resolvedCount30d: number;
  incidenciasActivas: ActiveIncident[];
  municipioStats: { name: string; count: number }[];
  statusCounts?: Record<string, number>;
  mttrByPriority?: { alta: number | null; media: number | null; baja: number | null };
  unassignedAgedCount?: number;
  topBuses?: { busId: string; ticketCount: number; operator: string | null; municipio: string | null }[];
  shiftLoadToday?: { M: number; T: number; N: number };
  /** Conteo global (no limitado al top de incidenciasActivas). */
  slaVencidosCount?: number;
  altaPrioridadCount?: number;
};

export type TrendDay = { day: string; creados: number; resueltos: number };

export type TrendSummary = {
  totalCreados: number;
  totalResueltos: number;
  promedioCreadosDia: number;
  peak: { day: string; creados: number } | null;
  topOperators: { busId: string; operator: string; creados: number }[];
};
