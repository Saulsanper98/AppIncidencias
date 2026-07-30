import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { getDesviosPoller } from "@/lib/desvios/email-poller";
import { countOpenSlaMetrics } from "@/lib/operations/ticker-data";
import { prisma } from "@/lib/prisma";

/** Salud operativa ligera para widgets de dashboard (cualquier usuario autenticado). */
export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }

  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const poller = getDesviosPoller().status();

  const [activeDesvios, openTickets, unassignedAged, slaMetrics] = await Promise.all([
    prisma.desvio.count({ where: { estado: "ACTIVO" } }),
    prisma.ticket.count({ where: { status: "abierto" } }),
    prisma.ticket.count({
      where: {
        status: { not: "resuelto" },
        assignedToUserId: null,
        createdAt: { lte: thirtyMinutesAgo },
      },
    }),
    countOpenSlaMetrics(now),
  ]);

  return NextResponse.json({
    pollerRunning: poller.running,
    pollerLastError: poller.lastError,
    activeDesvios,
    openTickets,
    unassignedAged,
    slaVencidos: slaMetrics.slaVencidosCount,
    altaPrioridad: slaMetrics.altaPrioridadCount,
  });
}
