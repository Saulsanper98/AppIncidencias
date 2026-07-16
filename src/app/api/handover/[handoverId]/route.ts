/**
 * Mantenimiento de un pase de turno individual.
 *
 *  - PATCH { action: "acknowledge" } → el turno entrante "firma" haber
 *    leído el pase. Una vez firmado no se puede deshacer (igual que en
 *    papel).
 *  - PATCH { action: "complete_item" | "reopen_item" | "cancel_item", itemId }
 *    → actualiza un pendiente de la checklist (no afecta al acuse).
 *  - DELETE → solo el autor o un gestor puede borrar un pase. Útil para
 *    corregir un envío erróneo antes de que lo lea el siguiente turno.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import {
  countOpenPendingItems,
  markPendingItem,
  parsePendingItemsJson,
  serializePendingItems,
  type HandoverPendingItemStatus,
} from "@/lib/handover-pending-items";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ handoverId: string }> };

const ITEM_ACTIONS = new Set(["complete_item", "reopen_item", "cancel_item"]);

function statusForAction(action: string): HandoverPendingItemStatus | null {
  if (action === "complete_item") return "hecha";
  if (action === "reopen_item") return "abierta";
  if (action === "cancel_item") return "cancelada";
  return null;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  const { handoverId } = await params;

  let body: { action?: string; itemId?: string } = {};
  try {
    body = (await request.json()) as { action?: string; itemId?: string };
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (ITEM_ACTIONS.has(action)) {
    return patchPendingItem({
      handoverId,
      action,
      itemId: typeof body.itemId === "string" ? body.itemId : "",
      actor: {
        userId: actor.userId,
        displayName: actor.displayName,
      },
    });
  }

  if (action !== "acknowledge") {
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

async function patchPendingItem(args: {
  handoverId: string;
  action: string;
  itemId: string;
  actor: { userId: string; displayName: string };
}) {
  const nextStatus = statusForAction(args.action);
  if (!nextStatus) {
    return NextResponse.json({ message: "Acción no soportada" }, { status: 400 });
  }
  if (!args.itemId.trim()) {
    return NextResponse.json({ message: "Falta el id del pendiente" }, { status: 400 });
  }

  const handover = await prisma.shiftHandover.findUnique({ where: { id: args.handoverId } });
  if (!handover) {
    return NextResponse.json({ message: "Pase de turno no encontrado" }, { status: 404 });
  }

  const items = parsePendingItemsJson(handover.pendingItemsJson);
  if (items.length === 0) {
    return NextResponse.json(
      { message: "Este pase no tiene pendientes trazables" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: args.actor.userId },
    select: { name: true },
  });
  const displayName = user?.name ?? args.actor.displayName;

  const nextItems = markPendingItem(items, args.itemId.trim(), nextStatus, {
    userId: args.actor.userId,
    displayName,
  });
  if (!nextItems) {
    return NextResponse.json({ message: "Pendiente no encontrado" }, { status: 404 });
  }

  const updated = await prisma.shiftHandover.update({
    where: { id: handover.id },
    data: { pendingItemsJson: serializePendingItems(nextItems) },
  });

  await writeAuditEvent({
    userId: args.actor.userId,
    action: `handover.${args.action}`,
    detail: `${handover.shiftDate} · ${handover.shift} · ${args.itemId}`,
  });

  return NextResponse.json({
    handover: {
      ...updated,
      pendingItems: nextItems,
      openPendingCount: countOpenPendingItems(nextItems),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    },
  });
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
