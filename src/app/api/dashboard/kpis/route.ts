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

    const [ticketsAbiertos, allBuses, busesWithOpenTickets, resolvedRecent] = await Promise.all([
      prisma.ticket.count({ where: { status: "abierto" } }),
      prisma.bus.findMany({ select: { id: true } }),
      prisma.ticket.groupBy({ by: ["busId"], where: { status: { not: "resuelto" } } }),
      prisma.ticket.findMany({
        where: { status: "resuelto", updatedAt: { gte: thirtyDaysAgo } },
        select: { updatedAt: true, slaDeadline: true, createdAt: true },
      }),
    ]);

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

    return NextResponse.json({
      ticketsAbiertos,
      slaCompliancePercent,
      mttrMs: mttrMs !== null ? Math.round(mttrMs) : null,
      fleetAvailabilityPercent,
      resolvedCount30d: resolvedRecent.length,
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
    });
  } catch (error) {
    console.error("Error loading dashboard KPIs:", error);
    return NextResponse.json({ message: "No se pudieron cargar los KPIs" }, { status: 500 });
  }
}
