/**
 * Mantenimiento de un pase de turno individual.
 *
 *  - PATCH { action: "acknowledge" } → el turno entrante "firma" haber
 *    leído el pase. Una vez firmado no se puede deshacer (igual que en
 *    papel).
 *  - DELETE → solo el autor o un gestor puede borrar un pase. Útil para
 *    corregir un envío erróneo antes de que lo lea el siguiente turno.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ handoverId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  const { handoverId } = await params;

  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  if (body.action !== "acknowledge") {
    return NextResponse.json({ message: "Acción no soportada" }, { status: 400 });
  }

  const handover = await prisma.shiftHandover.findUnique({ where: { id: handoverId } });
  if (!handover) {
    return NextResponse.json({ message: "Pase de turno no encontrado" }, { status: 404 });
  }
  if (handover.acknowledgedAt) {
    // Idempotente: si ya está firmado, devolvemos el actual sin tocar nada.
    return NextResponse.json({ handover });
  }
  if (handover.authorId === actor.userId) {
    return NextResponse.json(
      { message: "No puedes firmar tu propio pase de turno" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true },
  });

  const updated = await prisma.shiftHandover.update({
    where: { id: handover.id },
    data: {
      acknowledgedById: actor.userId,
      acknowledgedByName: user?.name ?? actor.displayName,
      acknowledgedAt: new Date(),
    },
  });
  await writeAuditEvent({
    userId: actor.userId,
    action: "handover.acknowledged",
    detail: `${handover.shiftDate} · ${handover.shift}`,
  });
  return NextResponse.json({ handover: updated });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  const { handoverId } = await params;
  const handover = await prisma.shiftHandover.findUnique({ where: { id: handoverId } });
  if (!handover) {
    return NextResponse.json({ message: "Pase de turno no encontrado" }, { status: 404 });
  }
  const isAuthor = handover.authorId === actor.userId;
  const isManager = actor.role === "gestor_centro_control";
  if (!isAuthor && !isManager) {
    return NextResponse.json({ message: "No autorizado" }, { status: 403 });
  }
  if (handover.acknowledgedAt && !isManager) {
    return NextResponse.json(
      { message: "El pase ya ha sido firmado; pídeselo a un gestor" },
      { status: 400 },
    );
  }

  await prisma.shiftHandover.delete({ where: { id: handover.id } });
  await writeAuditEvent({
    userId: actor.userId,
    action: "handover.deleted",
    detail: `${handover.shiftDate} · ${handover.shift}`,
  });
  return NextResponse.json({ ok: true });
}
