import type {
  CustomDashboardData,
  NamedValue,
  SlaDayRow,
  SlaUrgentTicket,
  TrendDayRow,
} from "@/lib/dashboard/dashboard-data-types";
import { EMPTY_DASHBOARD_DATA } from "@/lib/dashboard/dashboard-data-types";
import { EMBED_DATA_SOURCES } from "@/lib/dashboard/data-sources";
import { countOpenSlaMetrics } from "@/lib/operations/ticker-data";
import { prisma } from "@/lib/prisma";

const DAY_NAMES_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function clampDays(n: number): number {
  if (!Number.isFinite(n)) return 7;
  return Math.min(90, Math.max(1, Math.round(n)));
}

function dayLabel(d: Date, useWeekday: boolean): string {
  if (useWeekday) return DAY_NAMES_ES[d.getDay()] ?? "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mapStatusRows(rows: { status: string; count: number }[]): NamedValue[] {
  const order = ["abierto", "en_proceso", "esperando_repuesto", "resuelto"] as const;
  const labels: Record<(typeof order)[number], string> = {
    abierto: "Abierto",
    en_proceso: "En Proceso",
    esperando_repuesto: "Esperando Repuesto",
    resuelto: "Resuelto",
  };
  const map = new Map(rows.map((r) => [r.status, r.count]));
  return order.map((key) => ({ name: labels[key], value: map.get(key) ?? 0 }));
}

function mapPriorityRows(rows: { priority: string; count: number }[]): NamedValue[] {
  const order = ["alta", "media", "baja"] as const;
  const labels = { alta: "Alta", media: "Media", baja: "Baja" };
  const map = new Map(rows.map((r) => [r.priority, r.count]));
  return order.map((key) => ({ name: labels[key], value: map.get(key) ?? 0 }));
}

function buildDailyBuckets(days: number, rangeStart: Date, useWeekday: boolean): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(rangeStart);
    d.setDate(rangeStart.getDate() + i);
    buckets.push({ key: dayKey(d), label: dayLabel(d, useWeekday) });
  }
  return buckets;
}

function formatDurationMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

export async function fetchCustomDashboardData(rawDays: number): Promise<CustomDashboardData> {
  const days = clampDays(rawDays);
  const useWeekday = days <= 14;
  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - (days - 1));

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const previousRangeStart = new Date(rangeStart);
  previousRangeStart.setDate(previousRangeStart.getDate() - days);

  const [
    ticketsAbiertos,
    activeIncidents,
    allBuses,
    busesWithOpenTickets,
    resolvedRecent,
    unassignedAged,
    ticketsCreatedToday,
    ticketsCreatedInRange,
    resolvedInRange,
    backlogGroups,
    periodStatusGroups,
    periodPriorityGroups,
    periodOperatorRows,
    allOpenForMap,
    topBusesRaw,
    slaMetrics,
    urgentTickets,
    technicianRows,
    anomalousTickets,
    previousCreatedCount,
    previousResolvedCount,
  ] = await Promise.all([
    prisma.ticket.count({ where: { status: "abierto" } }),
    prisma.ticket.count({ where: { status: { not: "resuelto" } } }),
    prisma.bus.findMany({ select: { id: true } }),
    prisma.ticket.groupBy({ by: ["busId"], where: { status: { not: "resuelto" } } }),
    prisma.ticket.findMany({
      where: { status: "resuelto", updatedAt: { gte: thirtyDaysAgo } },
      select: { updatedAt: true, slaDeadline: true, createdAt: true, priority: true, assignedToUserId: true },
    }),
    prisma.ticket.count({
      where: {
        status: { not: "resuelto" },
        assignedToUserId: null,
        createdAt: { lte: thirtyMinutesAgo },
      },
    }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
      select: { createdAt: true },
    }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: rangeStart } },
      select: { createdAt: true },
    }),
    prisma.ticket.findMany({
      where: { status: "resuelto", updatedAt: { gte: rangeStart } },
      select: { updatedAt: true, slaDeadline: true },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: { status: { not: "resuelto" } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: { createdAt: { gte: rangeStart } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["priority"],
      where: { createdAt: { gte: rangeStart } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ operator: string; value: number }[]>`
      SELECT COALESCE(b.operator, 'Sin operadora') AS operator, COUNT(*) AS value
      FROM "Ticket" t
      LEFT JOIN "Bus" b ON b.id = t.busId
      WHERE t.createdAt >= ${rangeStart}
      GROUP BY COALESCE(b.operator, 'Sin operadora')
      ORDER BY value DESC
    `,
    prisma.ticket.findMany({
      where: { status: { not: "resuelto" } },
      select: { mapPlaceMunicipio: true, bus: { select: { municipio: true } } },
    }),
    prisma.ticket.groupBy({
      by: ["busId"],
      where: { createdAt: { gte: rangeStart } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
    countOpenSlaMetrics(now),
    prisma.ticket.findMany({
      where: { status: { not: "resuelto" } },
      orderBy: { slaDeadline: "asc" },
      take: 8,
      select: { id: true, title: true, busId: true, slaDeadline: true },
    }),
    prisma.$queryRaw<{ name: string; value: number }[]>`
      SELECT COALESCE(u.name, 'Sin asignar') AS name, COUNT(*) AS value
      FROM "Ticket" t
      LEFT JOIN "User" u ON u.id = t.assignedToUserId
      WHERE t.status = 'resuelto' AND t.updatedAt >= ${thirtyDaysAgo}
      GROUP BY COALESCE(u.name, 'Sin asignar')
      ORDER BY value DESC
      LIMIT 8
    `,
    prisma.ticket.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { busId: true, tipo: true },
    }),
    prisma.ticket.count({
      where: { createdAt: { gte: previousRangeStart, lt: rangeStart } },
    }),
    prisma.ticket.count({
      where: { status: "resuelto", updatedAt: { gte: previousRangeStart, lt: rangeStart } },
    }),
  ]);

  const shiftLoadToday = { M: 0, T: 0, N: 0 };
  const shiftLoadYesterday = { M: 0, T: 0, N: 0 };
  for (const t of ticketsCreatedToday) {
    const h = t.createdAt.getHours();
    if (h >= 6 && h < 14) shiftLoadToday.M += 1;
    else if (h >= 14 && h < 22) shiftLoadToday.T += 1;
    else shiftLoadToday.N += 1;
  }

  const yesterdayTickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
    select: { createdAt: true },
  });
  for (const t of yesterdayTickets) {
    const h = t.createdAt.getHours();
    if (h >= 6 && h < 14) shiftLoadYesterday.M += 1;
    else if (h >= 14 && h < 22) shiftLoadYesterday.T += 1;
    else shiftLoadYesterday.N += 1;
  }

  const hourBuckets = Array.from({ length: 24 }, (_, h) => ({
    name: `${String(h).padStart(2, "0")}:00`,
    value: 0,
  }));
  for (const t of ticketsCreatedInRange) {
    const h = t.createdAt.getHours();
    hourBuckets[h].value += 1;
  }

  const slaCompliancePercent =
    resolvedRecent.length > 0
      ? Math.round(
          (resolvedRecent.filter((t) => t.updatedAt <= t.slaDeadline).length / resolvedRecent.length) * 100,
        )
      : null;

  const mttrMs =
    resolvedRecent.length > 0
      ? Math.round(
          resolvedRecent.reduce((sum, t) => sum + (t.updatedAt.getTime() - t.createdAt.getTime()), 0) /
            resolvedRecent.length,
        )
      : null;

  const mttr_by_priority: NamedValue[] = (["alta", "media", "baja"] as const).map((prio) => {
    const items = resolvedRecent.filter((t) => t.priority === prio);
    if (items.length === 0) return { name: prio.charAt(0).toUpperCase() + prio.slice(1), value: 0 };
    const avg =
      items.reduce((sum, t) => sum + (t.updatedAt.getTime() - t.createdAt.getTime()), 0) / items.length;
    return { name: `MTTR ${prio}`, value: Math.round(avg / 60_000) };
  });

  const fleetAvailabilityPercent =
    allBuses.length > 0
      ? Math.round(((allBuses.length - busesWithOpenTickets.length) / allBuses.length) * 100)
      : 100;

  const municipioMap = new Map<string, number>();
  for (const ticket of allOpenForMap) {
    const raw = ticket.mapPlaceMunicipio?.trim() || ticket.bus.municipio;
    const name = raw.split(",")[0].trim();
    if (!name) continue;
    municipioMap.set(name, (municipioMap.get(name) ?? 0) + 1);
  }
  const tickets_by_municipio = Array.from(municipioMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const topBusIds = topBusesRaw.map((b) => b.busId);
  const topBusMeta = topBusIds.length
    ? await prisma.bus.findMany({ where: { id: { in: topBusIds } }, select: { id: true, operator: true } })
    : [];
  const metaById = new Map(topBusMeta.map((b) => [b.id, b]));
  const top_buses: NamedValue[] = topBusesRaw.map((b) => ({
    name: metaById.get(b.busId)?.operator ? `${b.busId} · ${metaById.get(b.busId)?.operator}` : b.busId,
    value: b._count._all,
  }));

  const busScores = new Map<string, number>();
  for (const t of anomalousTickets) {
    busScores.set(t.busId, (busScores.get(t.busId) ?? 0) + 1);
  }
  const anomalous_buses: NamedValue[] = Array.from(busScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([busId, value]) => ({ name: busId, value }));

  const buckets = buildDailyBuckets(days, rangeStart, useWeekday);
  const createdByDay = new Map<string, number>();
  const resolvedByDay = new Map<string, number>();
  const slaByDay = new Map<string, { cumplido: number; incumplido: number }>();

  for (const t of ticketsCreatedInRange) {
    const key = dayKey(t.createdAt);
    createdByDay.set(key, (createdByDay.get(key) ?? 0) + 1);
  }
  for (const t of resolvedInRange) {
    const key = dayKey(t.updatedAt);
    resolvedByDay.set(key, (resolvedByDay.get(key) ?? 0) + 1);
    const slot = slaByDay.get(key) ?? { cumplido: 0, incumplido: 0 };
    if (t.updatedAt <= t.slaDeadline) slot.cumplido += 1;
    else slot.incumplido += 1;
    slaByDay.set(key, slot);
  }

  const tickets_trend: TrendDayRow[] = buckets.map((b) => ({
    day: b.label,
    creados: createdByDay.get(b.key) ?? 0,
    resueltos: resolvedByDay.get(b.key) ?? 0,
  }));

  const sla_compliance: SlaDayRow[] = buckets.map((b) => {
    const slot = slaByDay.get(b.key) ?? { cumplido: 0, incumplido: 0 };
    return { day: b.label, cumplido: slot.cumplido, incumplido: slot.incumplido };
  });

  const sla_urgent_tickets: SlaUrgentTicket[] = urgentTickets.map((t) => ({
    id: t.id,
    title: t.title,
    busId: t.busId,
    slaDeadline: t.slaDeadline.toISOString(),
    minutesLeft: Math.round((t.slaDeadline.getTime() - now.getTime()) / 60_000),
  }));

  const top_tecnicos: NamedValue[] = technicianRows.map((r) => ({
    name: String(r.name),
    value: Number(r.value),
  }));

  const shift_comparison: NamedValue[] = [
    { name: "Mañana ayer", value: shiftLoadYesterday.M },
    { name: "Mañana hoy", value: shiftLoadToday.M },
    { name: "Tarde ayer", value: shiftLoadYesterday.T },
    { name: "Tarde hoy", value: shiftLoadToday.T },
    { name: "Noche ayer", value: shiftLoadYesterday.N },
    { name: "Noche hoy", value: shiftLoadToday.N },
  ];

  return {
    days,
    generatedAt: now.toISOString(),
    kpis: {
      openTickets: ticketsAbiertos,
      activeIncidents,
      slaPercent: slaCompliancePercent,
      mttrMs,
      fleetAvailabilityPercent,
      unassignedAged: unassignedAged,
      resolved30d: resolvedRecent.length,
      createdToday: ticketsCreatedToday.length,
      slaVencidos: slaMetrics.slaVencidosCount,
      altaPrioridad: slaMetrics.altaPrioridadCount,
    },
    periodComparison: {
      days,
      currentCreated: ticketsCreatedInRange.length,
      previousCreated: previousCreatedCount,
      currentResolved: resolvedInRange.length,
      previousResolved: previousResolvedCount,
    },
    tickets_by_status: mapStatusRows(
      periodStatusGroups.map((g) => ({ status: g.status, count: g._count._all })),
    ),
    backlog_by_status: mapStatusRows(
      backlogGroups.map((g) => ({ status: g.status, count: g._count._all })),
    ),
    tickets_by_operator: periodOperatorRows.map((r) => ({ name: r.operator, value: Number(r.value) })),
    tickets_by_priority: mapPriorityRows(
      periodPriorityGroups.map((g) => ({ priority: g.priority, count: g._count._all })),
    ),
    tickets_by_municipio,
    top_buses,
    shift_load_today: [
      { name: "Mañana (M)", value: shiftLoadToday.M },
      { name: "Tarde (T)", value: shiftLoadToday.T },
      { name: "Noche (N)", value: shiftLoadToday.N },
    ],
    sla_compliance,
    tickets_trend,
    tickets_by_hour: hourBuckets,
    mttr_by_priority,
    top_tecnicos,
    shift_comparison,
    anomalous_buses,
    sla_urgent_tickets,
  };
}

export function formatMttrPriorityHint(values: NamedValue[]): string {
  const nonZero = values.filter((v) => v.value > 0);
  if (nonZero.length === 0) return "Sin resueltos en 30 días";
  return nonZero.map((v) => `${v.name}: ${v.value} min`).join(" · ");
}

const ANALYTICS_SOURCE_KEYS: Partial<Record<string, keyof CustomDashboardData>> = {
  tickets_by_status: "tickets_by_status",
  backlog_by_status: "backlog_by_status",
  tickets_by_operator: "tickets_by_operator",
  tickets_by_priority: "tickets_by_priority",
  tickets_by_municipio: "tickets_by_municipio",
  top_buses: "top_buses",
  anomalous_buses: "anomalous_buses",
  shift_load_today: "shift_load_today",
  shift_comparison: "shift_comparison",
  tickets_by_hour: "tickets_by_hour",
  mttr_by_priority: "mttr_by_priority",
  top_tecnicos: "top_tecnicos",
  sla_compliance: "sla_compliance",
  tickets_trend: "tickets_trend",
  embed_sla_urgent: "sla_urgent_tickets",
};

const EMBED_ONLY = new Set<string>(EMBED_DATA_SOURCES);

/** Reduce el payload cuando el cliente pide solo fuentes concretas (`?sources=`). */
export function filterDashboardDataBySources(
  full: CustomDashboardData,
  sources: readonly string[],
): Partial<CustomDashboardData> {
  const unique = [
    ...new Set(
      sources.filter((s) => s && s !== "manual" && s !== "operation_links" && !EMBED_ONLY.has(s)),
    ),
  ];
  if (unique.length === 0) return full;

  const partial: Partial<CustomDashboardData> = {
    days: full.days,
    generatedAt: full.generatedAt,
    periodComparison: full.periodComparison,
  };

  if (unique.some((s) => s.startsWith("kpi_"))) {
    partial.kpis = full.kpis;
  }

  for (const source of unique) {
    const key = ANALYTICS_SOURCE_KEYS[source];
    if (key && key !== "kpis") {
      (partial as Record<string, unknown>)[key] = full[key];
    }
  }

  return partial;
}
