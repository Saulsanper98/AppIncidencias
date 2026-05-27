/**
 * Reporte operativo agregado para la página `/reportes`.
 *
 * Una sola llamada devuelve todas las series y agregados que necesita el
 * dashboard analítico. Se ha priorizado el rendimiento usando `groupBy` /
 * `aggregate` de Prisma en vez de procesar las filas en Node.
 *
 * Filtros: `?days=30` (7-180).
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(180, Math.max(7, Number(searchParams.get("days") ?? 30)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    since.setUTCHours(0, 0, 0, 0);

    const [createdTickets, resolvedTickets, byPriority, byOperator, byTipo] =
      await Promise.all([
        prisma.ticket.findMany({
          where: { createdAt: { gte: since } },
          select: {
            createdAt: true,
            updatedAt: true,
            status: true,
            priority: true,
            slaDeadline: true,
            tipo: true,
            assignedToUserId: true,
            bus: { select: { operator: true } },
          },
        }),
        prisma.ticket.findMany({
          where: { status: "resuelto", updatedAt: { gte: since } },
          select: {
            createdAt: true,
            updatedAt: true,
            priority: true,
            slaDeadline: true,
            assignedToUserId: true,
            bus: { select: { operator: true } },
          },
        }),
        prisma.ticket.groupBy({
          by: ["priority"],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
        }),
        prisma.ticket.groupBy({
          by: ["busId"],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
        }),
        prisma.ticket.groupBy({
          by: ["tipo"],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
        }),
      ]);

    // Serie temporal por día: creados vs resueltos.
    const seriesMap = new Map<string, { day: string; creados: number; resueltos: number }>();
    for (let i = 0; i <= days; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const key = dayKey(d);
      seriesMap.set(key, { day: key, creados: 0, resueltos: 0 });
    }
    for (const t of createdTickets) {
      const key = dayKey(t.createdAt);
      const row = seriesMap.get(key);
      if (row) row.creados++;
    }
    for (const t of resolvedTickets) {
      const key = dayKey(t.updatedAt);
      const row = seriesMap.get(key);
      if (row) row.resueltos++;
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

    // MTTR por operadora (en resueltos).
    const mttrByOperatorMap = new Map<string, { total: number; n: number }>();
    for (const t of resolvedTickets) {
      const op = t.bus.operator ?? "—";
      const ms = t.updatedAt.getTime() - t.createdAt.getTime();
      const cur = mttrByOperatorMap.get(op) ?? { total: 0, n: 0 };
      cur.total += ms;
      cur.n++;
      mttrByOperatorMap.set(op, cur);
    }
    const mttrByOperator = Array.from(mttrByOperatorMap.entries()).map(
      ([operator, { total, n }]) => ({
        operator,
        mttrMs: n > 0 ? Math.round(total / n) : null,
        resolved: n,
      }),
    );

    // SLA global y por prioridad.
    const totalResolved = resolvedTickets.length;
    const slaOk = resolvedTickets.filter((t) => t.updatedAt <= t.slaDeadline).length;
    const slaCompliancePercent =
      totalResolved > 0 ? Math.round((slaOk / totalResolved) * 100) : null;

    const mttrMs =
      totalResolved > 0
        ? Math.round(
            resolvedTickets.reduce((acc, t) => acc + (t.updatedAt.getTime() - t.createdAt.getTime()), 0) /
              totalResolved,
          )
        : null;

    // Por tipo (top 10).
    const byTipoSorted = byTipo
      .map((g) => ({ tipo: g.tipo ?? "—", count: g._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Por prioridad ordenado.
    const byPrioritySorted = byPriority.map((g) => ({
      priority: g.priority,
      count: g._count._all,
    }));

    // Top 10 buses.
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

    // Top técnicos por resueltos (usando auditEvent → ticket.status_changed).
    const techGroups = await prisma.auditEvent.groupBy({
      by: ["userId"],
      where: {
        userId: { not: null },
        action: "ticket.status_changed",
        detail: { contains: "-> resuelto" },
        createdAt: { gte: since },
      },
      _count: { _all: true },
    });
    const techIds = techGroups
      .filter((g): g is { userId: string; _count: { _all: number } } => g.userId !== null)
      .map((g) => g.userId);
    const techUsers = techIds.length
      ? await prisma.user.findMany({
          where: { id: { in: techIds } },
          select: { id: true, name: true, role: true },
        })
      : [];
    const techMap = new Map(techUsers.map((u) => [u.id, u]));
    const topTechnicians = techGroups
      .map((g) => ({
        userId: g.userId ?? "",
        name: g.userId ? techMap.get(g.userId)?.name ?? "—" : "—",
        role: g.userId ? techMap.get(g.userId)?.role ?? "—" : "—",
        resolved: g._count._all,
      }))
      .sort((a, b) => b.resolved - a.resolved)
      .slice(0, 10);

    return NextResponse.json({
      days,
      since: since.toISOString(),
      totals: {
        created: createdTickets.length,
        resolved: totalResolved,
        slaCompliancePercent,
        mttrMs,
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
