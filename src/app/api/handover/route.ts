/**
 * Pases de turno (handovers) entre M/T/N.
 *
 *  - GET → lista paginada de los últimos handovers (con autor y firma de
 *    recepción si la hay).
 *  - POST → crea un pase nuevo del turno actual. El cliente envía
 *    `shiftDate` (yyyy-mm-dd) y `shift` (M/T/N), más los campos de texto.
 *    Opcionalmente se guarda un snapshot de tickets abiertos (`includeSnapshot`).
 */

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SHIFTS = new Set(["M", "T", "N"]);

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeText(value: unknown, max = 4000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const take = Math.min(50, Math.max(5, Number(searchParams.get("take") ?? 20)));

  const items = await prisma.shiftHandover.findMany({
    orderBy: [{ createdAt: "desc" }],
    take,
    select: {
      id: true,
      shiftDate: true,
      shift: true,
      authorId: true,
      authorName: true,
      summary: true,
      alerts: true,
      pendingActions: true,
      openTicketsJson: true,
      createdAt: true,
      updatedAt: true,
      acknowledgedById: true,
      acknowledgedByName: true,
      acknowledgedAt: true,
    },
  });

  return NextResponse.json({
    items: items.map((h) => ({
      ...h,
      createdAt: h.createdAt.toISOString(),
      updatedAt: h.updatedAt.toISOString(),
      acknowledgedAt: h.acknowledgedAt?.toISOString() ?? null,
      openTickets: h.openTicketsJson ? safeJson(h.openTicketsJson) : null,
    })),
  });
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  if (actor.role !== "gestor_centro_control" && actor.role !== "tecnico_campo") {
    return NextResponse.json(
      { message: "Solo el personal del centro de control puede pasar turno" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const shiftDate = typeof body.shiftDate === "string" && isYmd(body.shiftDate) ? body.shiftDate : null;
  const shift = typeof body.shift === "string" && VALID_SHIFTS.has(body.shift) ? body.shift : null;
  if (!shiftDate || !shift) {
    return NextResponse.json(
      { message: "Indica fecha (yyyy-mm-dd) y turno (M, T o N)" },
      { status: 400 },
    );
  }
  const summary = sanitizeText(body.summary, 8000);
  if (!summary) {
    return NextResponse.json({ message: "El resumen es obligatorio" }, { status: 400 });
  }
  const alerts = sanitizeText(body.alerts, 4000);
  const pendingActions = sanitizeText(body.pendingActions, 4000);

  // Snapshot opcional de tickets abiertos (criterio: status in [abierto,
  // en_proceso, esperando_repuesto], creados o tocados en las últimas 24h).
  let openTicketsJson: string | null = null;
  if (body.includeSnapshot === true) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tickets = await prisma.ticket.findMany({
      where: {
        status: { in: ["abierto", "en_proceso", "esperando_repuesto"] },
        OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 30,
      select: {
        id: true,
        title: true,
        busId: true,
        priority: true,
        status: true,
        assignedToUserId: true,
      },
    });
    openTicketsJson = JSON.stringify(tickets);
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true },
  });

  const created = await prisma.shiftHandover.create({
    data: {
      shiftDate,
      shift,
      authorId: actor.userId,
      authorName: user?.name ?? actor.displayName,
      summary,
      alerts,
      pendingActions,
      openTicketsJson,
    },
  });

  await writeAuditEvent({
    userId: actor.userId,
    action: "handover.created",
    detail: `${shiftDate} · ${shift} · ${summary.slice(0, 60)}`,
  });

  return NextResponse.json({ handover: created }, { status: 201 });
}
