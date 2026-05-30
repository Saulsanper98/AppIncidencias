import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Umbral para "tickets sin asignar pendientes": tickets abiertos /
    // en proceso / esperando repuesto con `assignedToUserId = null` que llevan
    // más de 30 minutos sin tocar.
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // Ventana del día de calendario actual: usado para el reparto de carga
    // por turno (M / T / N) que pinta la card "Carga por turno hoy".
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [
      ticketsAbiertos,
      allBuses,
      busesWithOpenTickets,
      resolvedRecent,
      statusGroups,
      ticketsCreatedRecent,
      unassignedAged,
      ticketsCreatedToday,
    ] = await Promise.all([
      prisma.ticket.count({ where: { status: "abierto" } }),
      prisma.bus.findMany({ select: { id: true } }),
      prisma.ticket.groupBy({ by: ["busId"], where: { status: { not: "resuelto" } } }),
      prisma.ticket.findMany({
        where: { status: "resuelto", updatedAt: { gte: thirtyDaysAgo } },
        select: {
          updatedAt: true,
          slaDeadline: true,
          createdAt: true,
          priority: true,
          busId: true,
        },
      }),
      // Conteo por estado para alimentar el funnel de "Flujo de ticketing".
      prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
      // Tickets creados en los últimos 30 días — agrupados por bus para el
      // ranking de buses problemáticos.
      prisma.ticket.groupBy({
        by: ["busId"],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      }),
      prisma.ticket.count({
        where: {
          status: { not: "resuelto" },
          assignedToUserId: null,
          createdAt: { lte: thirtyMinutesAgo },
        },
      }),
      // Tickets creados HOY (entre 00:00 y 23:59), solo `createdAt` para
      // poder repartir por hora en el cálculo del turno (M/T/N).
      prisma.ticket.findMany({
        where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
        select: { createdAt: true },
      }),
    ]);

    // Carga por turno: M = 6h–14h, T = 14h–22h, N = 22h–6h.
    // Coincide con el cálculo de `currentShiftFromHour` que usa el
    // formulario de "Pase de turno" en /handover, así los números cuadran.
    const shiftLoadToday = { M: 0, T: 0, N: 0 };
    for (const t of ticketsCreatedToday) {
      const h = t.createdAt.getHours();
      if (h >= 6 && h < 14) shiftLoadToday.M += 1;
      else if (h >= 14 && h < 22) shiftLoadToday.T += 1;
      else shiftLoadToday.N += 1;
    }

    const statusCounts: Record<string, number> = {
      abierto: 0,
      en_proceso: 0,
      esperando_repuesto: 0,
      resuelto: 0,
    };
    for (const g of statusGroups) {
      statusCounts[g.status] = g._count._all;
    }

    const slaCompliancePercent =
      resolvedRecent.length > 0
        ? Math.round(
            (resolvedRecent.filter((t) => t.updatedAt <= t.slaDeadline).length / resolvedRecent.length) * 100,
          )
        : null;

    const mttrMs =
      resolvedRecent.length > 0
        ? resolvedRecent.reduce((sum, t) => sum + (t.updatedAt.getTime() - t.createdAt.getTime()), 0) /
          resolvedRecent.length
        : null;

    // MTTR por prioridad. Útil para detectar si las altas se están atendiendo
    // antes que las medias/bajas (que es lo deseable).
    const mttrByPriority: Record<"alta" | "media" | "baja", number | null> = {
      alta: null,
      media: null,
      baja: null,
    };
    for (const prio of ["alta", "media", "baja"] as const) {
      const items = resolvedRecent.filter((t) => t.priority === prio);
      if (items.length === 0) continue;
      const sum = items.reduce(
        (acc, t) => acc + (t.updatedAt.getTime() - t.createdAt.getTime()),
        0,
      );
      mttrByPriority[prio] = Math.round(sum / items.length);
    }

    const fleetAvailabilityPercent =
      allBuses.length > 0
        ? Math.round(((allBuses.length - busesWithOpenTickets.length) / allBuses.length) * 100)
        : 100;

    const [activeTickets, allOpenForMap] = await Promise.all([
      prisma.ticket.findMany({
        where: { status: { not: "resuelto" } },
        orderBy: [{ slaDeadline: "asc" }],
        take: 8,
        include: {
          bus: { select: { operator: true, municipio: true } },
          asset: { select: { type: true } },
        },
      }),
      prisma.ticket.findMany({
        where: { status: { not: "resuelto" } },
        select: { mapPlaceMunicipio: true, bus: { select: { municipio: true } } },
      }),
    ]);

    const municipioMap = new Map<string, number>();
    for (const ticket of allOpenForMap) {
      const raw = ticket.mapPlaceMunicipio?.trim() || ticket.bus.municipio;
      const name = raw.split(",")[0].trim();
      municipioMap.set(name, (municipioMap.get(name) ?? 0) + 1);
    }
    const municipioStats = Array.from(municipioMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Top 10 buses con más tickets en los últimos 30 días.
    const topBusesRaw = [...ticketsCreatedRecent]
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10);
    const topBusIds = topBusesRaw.map((b) => b.busId);
    const topBusMeta = topBusIds.length
      ? await prisma.bus.findMany({
          where: { id: { in: topBusIds } },
          select: { id: true, operator: true, municipio: true },
        })
      : [];
    const metaById = new Map(topBusMeta.map((b) => [b.id, b]));
    const topBuses = topBusesRaw.map((b) => ({
      busId: b.busId,
      ticketCount: b._count._all,
      operator: metaById.get(b.busId)?.operator ?? null,
      municipio: metaById.get(b.busId)?.municipio ?? null,
    }));

    return NextResponse.json({
      ticketsAbiertos,
      slaCompliancePercent,
      mttrMs: mttrMs !== null ? Math.round(mttrMs) : null,
      mttrByPriority,
      fleetAvailabilityPercent,
      resolvedCount30d: resolvedRecent.length,
      unassignedAgedCount: unassignedAged,
      topBuses,
      incidenciasActivas: activeTickets.map((t) => ({
        id: t.id,
        busId: t.busId,
        operator: t.bus.operator,
        municipio: t.bus.municipio,
        assetType: t.asset.type,
        status: t.status,
        priority: t.priority,
        slaDeadline: t.slaDeadline.toISOString(),
        title: t.title,
      })),
      municipioStats,
      statusCounts,
      shiftLoadToday,
    });
  } catch (error) {
    console.error("Error loading dashboard KPIs:", error);
    return NextResponse.json({ message: "No se pudieron cargar los KPIs" }, { status: 500 });
  }
}
