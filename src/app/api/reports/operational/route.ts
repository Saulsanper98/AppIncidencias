/**
 * Reporte operativo agregado para la página `/reportes`.
 *
 * Una sola llamada devuelve todas las series y agregados que necesita el
 * dashboard analítico. Se ha priorizado el rendimiento usando `groupBy` /
 * `aggregate` de Prisma en vez de procesar las filas en Node.
 *
 * Filtros (en orden de prioridad):
 *  - `?from=YYYY-MM-DD&to=YYYY-MM-DD` → rango personalizado.
 *  - `?range=today|yesterday|last7|last30|last90|last180` → preset.
 *  - `?days=N` (7-180) → compatibilidad histórica (equivalente a lastN).
 *
 * Métricas de resolución (SLA, MTTR, serie «resueltos», top técnicos):
 * fuente única `TicketStatusChange` vía `getReportResolutionAnalytics`.
 * El payload incluye `metricsMeta` con definiciones y calidad de datos.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { REPORT_METRIC_DEFINITIONS } from "@/lib/report-metrics-definitions";
import { canViewOperationalReports } from "@/lib/rbac";
import {
  dayKeyUtc,
  endOfDayUtc,
  resolveOperationalReportRange,
  startOfDayUtc,
} from "@/lib/report-date-range";
import {
  getReportResolutionAnalytics,
  getTopTechniciansByResolutions,
} from "@/lib/ticket-resolution-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }
    if (!canViewOperationalReports(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para ver reportes operativos" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const { since, until, preset, label } = resolveOperationalReportRange(searchParams);
    const days = Math.max(
      1,
      Math.round((endOfDayUtc(until).getTime() - startOfDayUtc(since).getTime() + 1) / (24 * 60 * 60 * 1000)),
    );

    const previousUntil = new Date(startOfDayUtc(since).getTime() - 1);
    const previousSince = new Date(startOfDayUtc(previousUntil));
    previousSince.setUTCDate(previousSince.getUTCDate() - (days - 1));

    const [createdTickets, resolutionAnalytics, byPriority, byOperator, byTipo, previousCreatedCount, previousResolutionAnalytics] =
      await Promise.all([
        prisma.ticket.findMany({
          where: { createdAt: { gte: since, lte: until } },
          select: {
            createdAt: true,
            bus: { select: { operator: true } },
          },
        }),
        getReportResolutionAnalytics(since, until),
        prisma.ticket.groupBy({
          by: ["priority"],
          where: { createdAt: { gte: since, lte: until } },
          _count: { _all: true },
        }),
        prisma.ticket.groupBy({
          by: ["busId"],
          where: { createdAt: { gte: since, lte: until } },
          _count: { _all: true },
        }),
        prisma.ticket.groupBy({
          by: ["tipo"],
          where: { createdAt: { gte: since, lte: until } },
          _count: { _all: true },
        }),
        prisma.ticket.count({
          where: { createdAt: { gte: previousSince, lte: previousUntil } },
        }),
        getReportResolutionAnalytics(previousSince, previousUntil),
      ]);

    // Serie temporal por día: creados vs resueltos.
    const seriesMap = new Map<string, { day: string; creados: number; resueltos: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const key = dayKeyUtc(d);
      seriesMap.set(key, { day: key, creados: 0, resueltos: 0 });
    }
    for (const t of createdTickets) {
      const key = dayKeyUtc(t.createdAt);
      const row = seriesMap.get(key);
      if (row) row.creados++;
    }
    for (const [day, count] of resolutionAnalytics.resolvedByDay.entries()) {
      const row = seriesMap.get(day);
      if (row) row.resueltos = count;
    }
    const series = Array.from(seriesMap.values()).sort((a, b) =>
      a.day.localeCompare(b.day),
    );

    // Por operadora (creados).
    const byOperatorMap = new Map<string, number>();
    for (const t of createdTickets) {
      const op = t.bus.operator ?? "—";
      byOperatorMap.set(op, (byOperatorMap.get(op) ?? 0) + 1);
    }
    const byOperator2 = Array.from(byOperatorMap.entries())
      .map(([operator, count]) => ({ operator, count }))
      .sort((a, b) => b.count - a.count);

    const mttrByOperator = resolutionAnalytics.mttrByOperator;
    const totalResolved = resolutionAnalytics.resolutionEvents;
    const slaCompliancePercent = resolutionAnalytics.slaCompliancePercent;
    const mttrMs = resolutionAnalytics.mttrMs;

    const byTipoSorted = byTipo
      .map((g) => ({ tipo: g.tipo ?? "—", count: g._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const byPrioritySorted = byPriority.map((g) => ({
      priority: g.priority,
      count: g._count._all,
    }));

    const topBusesRaw = byOperator.sort((a, b) => b._count._all - a._count._all).slice(0, 10);
    const busMeta = await prisma.bus.findMany({
      where: { id: { in: topBusesRaw.map((g) => g.busId) } },
      select: { id: true, operator: true, municipio: true },
    });
    const metaById = new Map(busMeta.map((b) => [b.id, b]));
    const topBuses = topBusesRaw.map((g) => ({
      busId: g.busId,
      count: g._count._all,
      operator: metaById.get(g.busId)?.operator ?? null,
      municipio: metaById.get(g.busId)?.municipio ?? null,
    }));

    const topTechnicians = await getTopTechniciansByResolutions(since, until);

    return NextResponse.json({
      days,
      preset,
      label,
      since: since.toISOString(),
      until: until.toISOString(),
      totals: {
        created: createdTickets.length,
        resolved: totalResolved,
        uniqueTicketsResolved: resolutionAnalytics.uniqueTicketsResolved,
        slaCompliancePercent,
        mttrMs,
      },
      metricsMeta: {
        definitions: REPORT_METRIC_DEFINITIONS,
        dataQuality: resolutionAnalytics.dataQuality,
        previousPeriod: {
          since: previousSince.toISOString(),
          until: previousUntil.toISOString(),
          label: `Periodo anterior (${days} día${days === 1 ? "" : "s"})`,
          totals: {
            created: previousCreatedCount,
            resolved: previousResolutionAnalytics.resolutionEvents,
            slaCompliancePercent: previousResolutionAnalytics.slaCompliancePercent,
            mttrMs: previousResolutionAnalytics.mttrMs,
          },
        },
      },
      series,
      byPriority: byPrioritySorted,
      byOperator: byOperator2,
      mttrByOperator,
      byTipo: byTipoSorted,
      topBuses,
      topTechnicians,
    });
  } catch (error) {
    console.error("Error en /api/reports/operational:", error);
    return NextResponse.json(
      { message: "No se pudo generar el reporte operativo" },
      { status: 500 },
    );
  }
}
