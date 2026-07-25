import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import type { CustomDashboardData, NamedValue, SlaDayRow, TrendDayRow } from "@/lib/dashboard/dashboard-data-types";
import { prisma } from "@/lib/prisma";

const DAY_NAMES_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function clampDays(raw: string | null): number {
  const n = Number.parseInt(raw ?? "7", 10);
  if (!Number.isFinite(n)) return 7;
  return Math.min(90, Math.max(1, n));
}

function dayLabel(d: Date, useWeekday: boolean): string {
  if (useWeekday) return DAY_NAMES_ES[d.getDay()] ?? "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
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

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para ver datos de dashboard" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = clampDays(searchParams.get("days"));
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

    const [
      ticketsAbiertos,
      allBuses,
      busesWithOpenTickets,
      resolvedRecent,
      unassignedAged,
      ticketsCreatedToday,
      backlogGroups,
      periodStatusGroups,
      periodPriorityGroups,
      periodOperatorRows,
      allOpenForMap,
      topBusesRaw,
    ] = await Promise.all([
      prisma.ticket.count({ where: { status: "abierto" } }),
      prisma.bus.findMany({ select: { id: true } }),
      prisma.ticket.groupBy({ by: ["busId"], where: { status: { not: "resuelto" } } }),
      prisma.ticket.findMany({
        where: { status: "resuelto", updatedAt: { gte: thirtyDaysAgo } },
        select: { updatedAt: true, slaDeadline: true, createdAt: true },
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
    ]);

    const shiftLoadToday = { M: 0, T: 0, N: 0 };
    for (const t of ticketsCreatedToday) {
      const h = t.createdAt.getHours();
      if (h >= 6 && h < 14) shiftLoadToday.M += 1;
      else if (h >= 14 && h < 22) shiftLoadToday.T += 1;
      else shiftLoadToday.N += 1;
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

    const tickets_trend: TrendDayRow[] = await Promise.all(
      Array.from({ length: days }, async (_, i) => {
        const daysAgo = days - 1 - i;
        const dayStart = new Date();
        dayStart.setDate(dayStart.getDate() - daysAgo);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const [creados, resueltos] = await Promise.all([
          prisma.ticket.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
          prisma.ticket.count({
            where: { status: "resuelto", updatedAt: { gte: dayStart, lte: dayEnd } },
          }),
        ]);

        return { day: dayLabel(dayStart, useWeekday), creados, resueltos };
      }),
    );

    const sla_compliance: SlaDayRow[] = await Promise.all(
      Array.from({ length: days }, async (_, i) => {
        const daysAgo = days - 1 - i;
        const dayStart = new Date();
        dayStart.setDate(dayStart.getDate() - daysAgo);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const resolvedDay = await prisma.ticket.findMany({
          where: { status: "resuelto", updatedAt: { gte: dayStart, lte: dayEnd } },
          select: { updatedAt: true, slaDeadline: true },
        });

        let cumplido = 0;
        let incumplido = 0;
        for (const t of resolvedDay) {
          if (t.updatedAt <= t.slaDeadline) cumplido += 1;
          else incumplido += 1;
        }

        return { day: dayLabel(dayStart, useWeekday), cumplido, incumplido };
      }),
    );

    const payload: CustomDashboardData = {
      days,
      generatedAt: now.toISOString(),
      kpis: {
        openTickets: ticketsAbiertos,
        slaPercent: slaCompliancePercent,
        mttrMs,
        fleetAvailabilityPercent,
        unassignedAged: unassignedAged,
        resolved30d: resolvedRecent.length,
        createdToday: ticketsCreatedToday.length,
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
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    return NextResponse.json({ message: "No se pudieron cargar los datos del dashboard" }, { status: 500 });
  }
}
