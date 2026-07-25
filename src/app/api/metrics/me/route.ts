/**
 * Métricas personales del usuario autenticado.
 *
 * Pensado para técnicos, pero accesible para cualquier rol autenticado.
 * Devuelve:
 *   - Tickets resueltos por mí en 7/30/90 días.
 *   - Tickets actualmente asignados a mí.
 *   - MTTR medio de mis tickets resueltos en 30d.
 *   - % SLA cumplido en mis tickets resueltos (30d).
 *   - Top 5 tipologías de mis tickets (count + nivel).
 *   - Ranking actual entre técnicos: mi posición por resueltos en 30d.
 *
 * No expone datos sensibles de otros usuarios — solo agrega counts.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { countResolutionsByUser, getTopTechniciansByResolutions } from "@/lib/ticket-resolution-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }

    const userId = actor.userId;
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Resueltos por mí: `TicketStatusChange` captura todos los flujos
    // (cambio de estado, alta ya resuelta, express, borrador promovido).
    const [
      resolvedByMe7,
      resolvedByMe30,
      resolvedByMe90,
      myAssignedCount,
      myResolvedTickets30,
      myTickets30,
      rankingRows30,
    ] = await Promise.all([
      countResolutionsByUser(userId, d7),
      countResolutionsByUser(userId, d30),
      countResolutionsByUser(userId, d90),
      prisma.ticket.count({
        where: { assignedToUserId: userId, status: { not: "resuelto" } },
      }),
      // Tickets resueltos asignados a mí en 30d → MTTR y SLA personal.
      prisma.ticket.findMany({
        where: {
          assignedToUserId: userId,
          status: "resuelto",
          updatedAt: { gte: d30 },
        },
        select: {
          createdAt: true,
          updatedAt: true,
          slaDeadline: true,
          priority: true,
        },
      }),
      // Lista de tickets de los últimos 30d donde estuve asignado, para
      // calcular tipologías top.
      prisma.ticket.findMany({
        where: { assignedToUserId: userId, createdAt: { gte: d30 } },
        select: { tipo: true, subtipo: true, nivelImpacto: true },
      }),
      getTopTechniciansByResolutions(d30, now, 0),
    ]);

    const mttrMs =
      myResolvedTickets30.length > 0
        ? Math.round(
            myResolvedTickets30.reduce(
              (sum, t) => sum + (t.updatedAt.getTime() - t.createdAt.getTime()),
              0,
            ) / myResolvedTickets30.length,
          )
        : null;

    const slaCompliancePercent =
      myResolvedTickets30.length > 0
        ? Math.round(
            (myResolvedTickets30.filter((t) => t.updatedAt <= t.slaDeadline).length /
              myResolvedTickets30.length) *
              100,
          )
        : null;

    // Top tipologías (tipo + subtipo).
    const tipologiaMap = new Map<string, { count: number; tipo: string; subtipo: string; nivel: string | null }>();
    for (const t of myTickets30) {
      const key = `${t.tipo ?? "—"}//${t.subtipo ?? "—"}`;
      const existing = tipologiaMap.get(key);
      if (existing) existing.count++;
      else tipologiaMap.set(key, { count: 1, tipo: t.tipo ?? "—", subtipo: t.subtipo ?? "—", nivel: t.nivelImpacto });
    }
    const topTipologias = Array.from(tipologiaMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Ranking: ordenar grupos descendentemente y encontrar mi posición.
    const ranking = rankingRows30.map((r) => ({ userId: r.userId, count: r.resolved }));
    const myRankIndex = ranking.findIndex((r) => r.userId === userId);
    const myRank = myRankIndex === -1 ? null : myRankIndex + 1;
    const rankTotal = ranking.length;

    return NextResponse.json({
      resolvedByMe: {
        last7: resolvedByMe7,
        last30: resolvedByMe30,
        last90: resolvedByMe90,
      },
      currentlyAssigned: myAssignedCount,
      mttrMs,
      slaCompliancePercent,
      topTipologias,
      ranking: { myRank, total: rankTotal },
    });
  } catch (error) {
    console.error("Error en /api/metrics/me:", error);
    return NextResponse.json({ message: "No se pudo cargar tus métricas" }, { status: 500 });
  }
}
