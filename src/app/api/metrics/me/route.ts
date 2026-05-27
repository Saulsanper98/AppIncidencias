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

    // Para "resueltos por mí" usamos el AuditEvent `ticket.status_changed`
    // donde el actor sea el usuario y el destino sea `resuelto`. Esto es
    // más fiable que asumir que el asignado actual es quien lo resolvió.
    const [
      resolvedByMe7,
      resolvedByMe30,
      resolvedByMe90,
      myAssignedCount,
      myResolvedTickets30,
      myTickets30,
      othersResolvedByUser30,
    ] = await Promise.all([
      prisma.auditEvent.count({
        where: {
          userId,
          action: "ticket.status_changed",
          detail: { contains: "-> resuelto" },
          createdAt: { gte: d7 },
        },
      }),
      prisma.auditEvent.count({
        where: {
          userId,
          action: "ticket.status_changed",
          detail: { contains: "-> resuelto" },
          createdAt: { gte: d30 },
        },
      }),
      prisma.auditEvent.count({
        where: {
          userId,
          action: "ticket.status_changed",
          detail: { contains: "-> resuelto" },
          createdAt: { gte: d90 },
        },
      }),
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
      // Ranking por resueltos: agrupamos eventos por userId.
      prisma.auditEvent.groupBy({
        by: ["userId"],
        where: {
          userId: { not: null },
          action: "ticket.status_changed",
          detail: { contains: "-> resuelto" },
          createdAt: { gte: d30 },
        },
        _count: { _all: true },
      }),
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
    const ranking = othersResolvedByUser30
      .map((g) => ({ userId: g.userId, count: g._count._all }))
      .sort((a, b) => b.count - a.count);
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
