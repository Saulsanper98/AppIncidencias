import { prisma } from "@/lib/prisma";
import type { ReportDataQuality } from "@/lib/report-metrics-definitions";

/**
 * Resoluciones atribuibles a un técnico.
 *
 * Fuente de verdad: `TicketStatusChange` con `toStatus = resuelto`.
 * Cubre todos los flujos (cambio de estado, alta ya resuelta, express,
 * borrador promovido). No usar `AuditEvent` con búsqueda textual en
 * `detail`: deja fuera la mayoría de resoluciones reales.
 */
export async function countResolutionsByUser(
  userId: string,
  since: Date,
  until?: Date,
): Promise<number> {
  const updatedAtFilter = until ? { gte: since, lte: until } : { gte: since };
  const createdAtFilter = until ? { gte: since, lte: until } : { gte: since };

  const [events, legacy] = await Promise.all([
    prisma.ticketStatusChange.count({
      where: {
        changedByUserId: userId,
        toStatus: "resuelto",
        createdAt: createdAtFilter,
      },
    }),
    prisma.ticket.count({
      where: {
        assignedToUserId: userId,
        status: "resuelto",
        updatedAt: updatedAtFilter,
        statusHistory: { none: { toStatus: "resuelto" } },
      },
    }),
  ]);

  return events + legacy;
}

export type TechnicianResolutionRow = {
  userId: string;
  name: string;
  role: string;
  resolved: number;
};

export async function getTopTechniciansByResolutions(
  since: Date,
  until: Date,
  limit = 10,
): Promise<TechnicianResolutionRow[]> {
  const [techGroups, legacyGroups] = await Promise.all([
    prisma.ticketStatusChange.groupBy({
      by: ["changedByUserId"],
      where: {
        changedByUserId: { not: null },
        toStatus: "resuelto",
        createdAt: { gte: since, lte: until },
      },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["assignedToUserId"],
      where: {
        assignedToUserId: { not: null },
        status: "resuelto",
        updatedAt: { gte: since, lte: until },
        statusHistory: { none: { toStatus: "resuelto" } },
      },
      _count: { _all: true },
    }),
  ]);

  const countByUser = new Map<string, number>();
  for (const g of techGroups) {
    if (!g.changedByUserId) continue;
    countByUser.set(g.changedByUserId, (countByUser.get(g.changedByUserId) ?? 0) + g._count._all);
  }
  for (const g of legacyGroups) {
    if (!g.assignedToUserId) continue;
    countByUser.set(
      g.assignedToUserId,
      (countByUser.get(g.assignedToUserId) ?? 0) + g._count._all,
    );
  }

  const techIds = Array.from(countByUser.keys());
  const techUsers = techIds.length
    ? await prisma.user.findMany({
        where: { id: { in: techIds } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const techMap = new Map(techUsers.map((u) => [u.id, u]));

  const rows = techIds
    .map((userId) => ({
      userId,
      name: techMap.get(userId)?.name ?? "—",
      role: techMap.get(userId)?.role ?? "—",
      resolved: countByUser.get(userId) ?? 0,
    }))
    .sort((a, b) => b.resolved - a.resolved);

  return limit > 0 ? rows.slice(0, limit) : rows;
}

type ResolutionEventRow = {
  ticketId: string;
  resolvedAt: Date;
  changedByUserId: string | null;
  ticketCreatedAt: Date;
  slaDeadline: Date;
  operator: string | null;
  priority: string;
};

export type ReportResolutionAnalytics = {
  resolutionEvents: number;
  uniqueTicketsResolved: number;
  technicianAttributed: number;
  slaCompliancePercent: number | null;
  mttrMs: number | null;
  resolvedByDay: Map<string, number>;
  mttrByOperator: { operator: string; mttrMs: number | null; resolved: number }[];
  dataQuality: ReportDataQuality;
};

function dayKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Métricas de resolución alineadas para /reportes: serie temporal, SLA,
 * MTTR, ranking de técnicos y panel de calidad de datos.
 */
export async function getReportResolutionAnalytics(
  since: Date,
  until: Date,
): Promise<ReportResolutionAnalytics> {
  const [eventsRaw, legacyUpdatedAtCount, ticketsWithoutHistory] = await Promise.all([
    prisma.ticketStatusChange.findMany({
      where: {
        toStatus: "resuelto",
        createdAt: { gte: since, lte: until },
      },
      select: {
        ticketId: true,
        changedByUserId: true,
        createdAt: true,
        ticket: {
          select: {
            createdAt: true,
            slaDeadline: true,
            priority: true,
            bus: { select: { operator: true } },
          },
        },
      },
    }),
    prisma.ticket.count({
      where: { status: "resuelto", updatedAt: { gte: since, lte: until } },
    }),
    prisma.ticket.count({
      where: {
        status: "resuelto",
        statusHistory: { none: { toStatus: "resuelto" } },
        OR: [
          { resolvedAt: { gte: since, lte: until } },
          { resolvedAt: null, updatedAt: { gte: since, lte: until } },
        ],
      },
    }),
  ]);

  const events: ResolutionEventRow[] = eventsRaw.map((e) => ({
    ticketId: e.ticketId,
    resolvedAt: e.createdAt,
    changedByUserId: e.changedByUserId,
    ticketCreatedAt: e.ticket.createdAt,
    slaDeadline: e.ticket.slaDeadline,
    operator: e.ticket.bus.operator ?? "—",
    priority: e.ticket.priority,
  }));

  const resolutionEvents = events.length;
  const uniqueTicketsResolved = new Set(events.map((e) => e.ticketId)).size;
  const technicianAttributed = events.filter((e) => e.changedByUserId).length;

  const resolvedByDay = new Map<string, number>();
  for (const e of events) {
    const key = dayKeyUtc(e.resolvedAt);
    resolvedByDay.set(key, (resolvedByDay.get(key) ?? 0) + 1);
  }

  const slaOk = events.filter((e) => e.resolvedAt.getTime() <= e.slaDeadline.getTime()).length;
  const slaCompliancePercent =
    resolutionEvents > 0 ? Math.round((slaOk / resolutionEvents) * 100) : null;

  const mttrMs =
    resolutionEvents > 0
      ? Math.round(
          events.reduce(
            (acc, e) => acc + (e.resolvedAt.getTime() - e.ticketCreatedAt.getTime()),
            0,
          ) / resolutionEvents,
        )
      : null;

  const mttrByOperatorMap = new Map<string, { total: number; n: number }>();
  for (const e of events) {
    const cur = mttrByOperatorMap.get(e.operator ?? "—") ?? { total: 0, n: 0 };
    cur.total += e.resolvedAt.getTime() - e.ticketCreatedAt.getTime();
    cur.n += 1;
    mttrByOperatorMap.set(e.operator ?? "—", cur);
  }
  const mttrByOperator = Array.from(mttrByOperatorMap.entries()).map(
    ([operator, { total, n }]) => ({
      operator,
      mttrMs: n > 0 ? Math.round(total / n) : null,
      resolved: n,
    }),
  );

  return {
    resolutionEvents,
    uniqueTicketsResolved,
    technicianAttributed,
    slaCompliancePercent,
    mttrMs,
    resolvedByDay,
    mttrByOperator,
    dataQuality: {
      resolutionEvents,
      uniqueTicketsResolved,
      technicianAttributed,
      legacyUpdatedAtCount,
      gapLegacyVsEvents: legacyUpdatedAtCount - resolutionEvents,
      ticketsWithoutHistory,
    },
  };
}
