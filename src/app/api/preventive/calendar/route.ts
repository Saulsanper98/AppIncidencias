/**
 * Calendario de revisiones preventivas.
 *
 * Devuelve dos conjuntos:
 *  - `scheduled`: tareas con `scheduledAt` dentro del rango `[from, to)`
 *    (un mes por defecto).
 *  - `backlog`: tareas pendientes/programadas sin `scheduledAt` (pendientes
 *    de planificar fecha exacta) — útil para mostrar a un lado del calendario.
 *
 * Acepta:
 *   - `from`, `to` ISO yyyy-mm-dd → rango (sin rango → últimos 31 días + futuros 90).
 *   - `month` yyyy-mm → atajo para el mes completo.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseISODate(value: string | null): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

function startOfMonth(year: number, monthZeroBased: number): Date {
  return new Date(Date.UTC(year, monthZeroBased, 1));
}

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");
  let from = parseISODate(searchParams.get("from"));
  let to = parseISODate(searchParams.get("to"));

  if (monthParam) {
    const m = monthParam.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]) - 1;
      from = startOfMonth(year, month);
      to = startOfMonth(year, month + 1);
    }
  }
  if (!from) {
    from = new Date();
    from.setUTCDate(from.getUTCDate() - 31);
    from.setUTCHours(0, 0, 0, 0);
  }
  if (!to) {
    to = new Date(from);
    to.setUTCDate(from.getUTCDate() + 31 + 90);
  }

  const [scheduled, backlog] = await Promise.all([
    prisma.preventiveTask.findMany({
      where: { scheduledAt: { gte: from, lt: to } },
      orderBy: { scheduledAt: "asc" },
      include: {
        bus: { select: { id: true, operator: true, municipio: true } },
        assignedToUser: { select: { id: true, name: true } },
      },
    }),
    prisma.preventiveTask.findMany({
      where: {
        scheduledAt: null,
        status: { in: ["pendiente", "programada"] },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: {
        bus: { select: { id: true, operator: true, municipio: true } },
        assignedToUser: { select: { id: true, name: true } },
      },
    }),
  ]);

  const serialize = (task: (typeof scheduled)[number]) => ({
    id: task.id,
    busId: task.busId,
    operator: task.bus?.operator ?? null,
    municipio: task.bus?.municipio ?? null,
    assetType: task.assetType,
    reason: task.reason,
    status: task.status,
    scheduledAt: task.scheduledAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    assignedToUserId: task.assignedToUserId,
    assignedToUserName: task.assignedToUser?.name ?? null,
  });

  return NextResponse.json({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    scheduled: scheduled.map(serialize),
    backlog: backlog.map(serialize),
  });
}
