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
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "last90"
  | "last180"
  | "custom";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDayUtc(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

function endOfDayUtc(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(23, 59, 59, 999);
  return c;
}

function parseDateOnly(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function resolveRange(searchParams: URLSearchParams): {
  since: Date;
  until: Date;
  preset: RangePreset;
  label: string;
} {
  const now = new Date();
  const todayStart = startOfDayUtc(now);
  const fromParam = parseDateOnly(searchParams.get("from"));
  const toParam = parseDateOnly(searchParams.get("to"));
  if (fromParam) {
    const since = startOfDayUtc(fromParam);
    const until = toParam ? endOfDayUtc(toParam) : endOfDayUtc(fromParam);
    const label =
      fromParam.getTime() === (toParam?.getTime() ?? fromParam.getTime())
        ? `Día ${dayKey(fromParam)}`
        : `${dayKey(fromParam)} → ${dayKey(toParam ?? fromParam)}`;
    return { since, until, preset: "custom", label };
  }

  const range = (searchParams.get("range") ?? "").toLowerCase();
  switch (range) {
    case "today":
      return { since: todayStart, until: endOfDayUtc(now), preset: "today", label: "Hoy" };
    case "yesterday": {
      const y = new Date(todayStart);
      y.setUTCDate(y.getUTCDate() - 1);
      return { since: y, until: endOfDayUtc(y), preset: "yesterday", label: "Ayer" };
    }
    case "last7":
    case "last30":
    case "last90":
    case "last180": {
      const map: Record<string, number> = { last7: 7, last30: 30, last90: 90, last180: 180 };
      const n = map[range];
      const since = new Date(todayStart);
      since.setUTCDate(since.getUTCDate() - (n - 1));
      return {
        since,
        until: endOfDayUtc(now),
        preset: range as RangePreset,
        label: `Últimos ${n} días`,
      };
    }
  }

  // Compat: ?days=N (asumimos ventana terminando hoy).
  const daysParam = Number(searchParams.get("days") ?? 30);
  const days = Math.min(180, Math.max(1, Number.isFinite(daysParam) ? daysParam : 30));
  const since = new Date(todayStart);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const presetById: Record<number, RangePreset> = { 7: "last7", 30: "last30", 90: "last90", 180: "last180" };
  return {
    since,
    until: endOfDayUtc(now),
    preset: presetById[days] ?? "custom",
    label: `Últimos ${days} días`,
  };
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const { since, until, preset, label } = resolveRange(searchParams);
    const days = Math.max(
      1,
      Math.round((endOfDayUtc(until).getTime() - startOfDayUtc(since).getTime() + 1) / (24 * 60 * 60 * 1000)),
    );

    const [createdTickets, resolvedTickets, byPriority, byOperator, byTipo] =
      await Promise.all([
        prisma.ticket.findMany({
          where: { createdAt: { gte: since, lte: until } },
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
          where: { status: "resuelto", updatedAt: { gte: since, lte: until } },
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
      ]);

    // Serie temporal por día: creados vs resueltos.
    const seriesMap = new Map<string, { day: string; creados: number; resueltos: number }>();
    for (let i = 0; i < days; i++) {
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

    const techGroups = await prisma.auditEvent.groupBy({
      by: ["userId"],
      where: {
        userId: { not: null },
        action: "ticket.status_changed",
        detail: { contains: "-> resuelto" },
        createdAt: { gte: since, lte: until },
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
      preset,
      label,
      since: since.toISOString(),
      until: until.toISOString(),
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
