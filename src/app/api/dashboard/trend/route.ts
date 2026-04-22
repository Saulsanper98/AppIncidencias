import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
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

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const days = clampDays(searchParams.get("days"));
    const useWeekday = days <= 14;

    const trend = await Promise.all(
      Array.from({ length: days }, async (_, i) => {
        const daysAgo = days - 1 - i;
        const dayStart = new Date();
        dayStart.setDate(dayStart.getDate() - daysAgo);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const [creados, resueltos] = await Promise.all([
          prisma.ticket.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
          prisma.ticket.count({ where: { status: "resuelto", updatedAt: { gte: dayStart, lte: dayEnd } } }),
        ]);

        return { day: dayLabel(dayStart, useWeekday), creados, resueltos };
      }),
    );

    const totalCreados = trend.reduce((s, d) => s + d.creados, 0);
    const totalResueltos = trend.reduce((s, d) => s + d.resueltos, 0);
    let peakCandidate: { day: string; creados: number } | null = null;
    for (const row of trend) {
      if (!peakCandidate || row.creados > peakCandidate.creados) {
        peakCandidate = { day: row.day, creados: row.creados };
      }
    }
    const peak = peakCandidate && peakCandidate.creados > 0 ? peakCandidate : null;

    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - (days - 1));
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date();
    rangeEnd.setHours(23, 59, 59, 999);

    const createdByOperator = await prisma.ticket.groupBy({
      by: ["busId"],
      where: { createdAt: { gte: rangeStart, lte: rangeEnd } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });

    const busMeta = await prisma.bus.findMany({
      where: { id: { in: createdByOperator.map((g) => g.busId) } },
      select: { id: true, operator: true },
    });
    const opByBus = new Map(busMeta.map((b) => [b.id, b.operator]));

    const topOperators = createdByOperator.map((row) => ({
      busId: row.busId,
      operator: opByBus.get(row.busId) ?? "—",
      creados: row._count.id,
    }));

    return NextResponse.json({
      days,
      trend,
      summary: {
        totalCreados,
        totalResueltos,
        promedioCreadosDia: days > 0 ? Math.round((totalCreados / days) * 10) / 10 : 0,
        peak,
        topOperators,
      },
    });
  } catch (error) {
    console.error("Error loading dashboard trend:", error);
    return NextResponse.json({ message: "No se pudo cargar la tendencia" }, { status: 500 });
  }
}
