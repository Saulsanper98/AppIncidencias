/**
 * Detección de buses "anómalos": aquellos con un volumen de tickets en los
 * últimos N días que excede el percentil 80 de la flota o duplica la media.
 *
 * Pensado para alimentar un chip de "Atención" en `/inventory` y un widget
 * eventual del dashboard.
 *
 * Estrategia simple (sin ML):
 *  1. Cuenta tickets por bus en `windowDays` (default 30).
 *  2. Calcula media y desviación estándar sobre buses con ≥1 ticket.
 *  3. Marca como anómalo todo bus cuyo count >= max(media + 1.5·stddev, 3).
 *  4. Devuelve hasta 25 ordenados desc por count.
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
      return NextResponse.json(
        { message: "Debes iniciar sesión", anomalous: [] },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const windowDays = Math.min(
      180,
      Math.max(7, Number(searchParams.get("days") ?? 30)),
    );
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const grouped = await prisma.ticket.groupBy({
      by: ["busId"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    if (grouped.length === 0) {
      return NextResponse.json({ windowDays, anomalous: [], stats: { mean: 0, stddev: 0, threshold: 0 } });
    }

    const counts = grouped.map((g) => g._count._all);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance =
      counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    const stddev = Math.sqrt(variance);
    const threshold = Math.max(3, Math.ceil(mean + 1.5 * stddev));

    const anomalousIds = grouped
      .filter((g) => g._count._all >= threshold)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 25);

    const busMeta = await prisma.bus.findMany({
      where: { id: { in: anomalousIds.map((g) => g.busId) } },
      select: { id: true, operator: true, municipio: true },
    });
    const metaById = new Map(busMeta.map((b) => [b.id, b]));

    return NextResponse.json({
      windowDays,
      stats: { mean: Math.round(mean * 10) / 10, stddev: Math.round(stddev * 10) / 10, threshold },
      anomalous: anomalousIds.map((g) => ({
        busId: g.busId,
        ticketCount: g._count._all,
        operator: metaById.get(g.busId)?.operator ?? null,
        municipio: metaById.get(g.busId)?.municipio ?? null,
        // Relevancia relativa: cuántas desviaciones por encima de la media.
        zScore: stddev > 0 ? Math.round(((g._count._all - mean) / stddev) * 10) / 10 : null,
      })),
    });
  } catch (error) {
    console.error("Error en /api/buses/anomalous:", error);
    return NextResponse.json(
      { message: "No se pudo calcular detección de buses anómalos", anomalous: [] },
      { status: 500 },
    );
  }
}
