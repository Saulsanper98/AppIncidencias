import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { serializeBitacoraEntry } from "@/lib/bitacora-shared";
import { prisma } from "@/lib/prisma";
import { canModerateBitacora } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  kind: z.enum(["nota", "alerta", "pendiente"]).optional(),
  title: z.string().trim().max(160).optional().nullable(),
  contentJson: z.unknown().optional(),
  pinned: z.boolean().optional(),
});

type RouteCtx = { params: Promise<{ entryId: string }> };

export async function GET(request: Request, ctx: RouteCtx) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  const { entryId } = await ctx.params;
  const row = await prisma.bitacoraEntry.findUnique({ where: { id: entryId } });
  if (!row) {
    return NextResponse.json({ message: "Entrada no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ entry: serializeBitacoraEntry(row) });
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  const { entryId } = await ctx.params;
  const existing = await prisma.bitacoraEntry.findUnique({ where: { id: entryId } });
  if (!existing) {
    return NextResponse.json({ message: "Entrada no encontrada" }, { status: 404 });
  }

  const isOwner = existing.authorId === actor.userId;
  const isManager = canModerateBitacora(actor.role);
  if (!isOwner && !isManager) {
    return NextResponse.json({ message: "Sin permisos para editar esta entrada" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
  }

  const data = parsed.data;
  const row = await prisma.bitacoraEntry.update({
    where: { id: entryId },
    data: {
      ...(data.kind !== undefined ? { kind: data.kind } : {}),
      ...(data.title !== undefined ? { title: data.title?.trim() || null } : {}),
      ...(data.contentJson !== undefined ? { contentJson: JSON.stringify(data.contentJson) } : {}),
      ...(data.pinned !== undefined ? { pinned: data.pinned } : {}),
    },
  });

  await writeAuditEvent({
    userId: actor.userId,
    action: "bitacora.updated",
    detail: row.id,
  });

  return NextResponse.json({ ok: true, entry: serializeBitacoraEntry(row) });
}

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const actor = await resolveRequestActor(_request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  const { entryId } = await ctx.params;
  const existing = await prisma.bitacoraEntry.findUnique({ where: { id: entryId } });
  if (!existing) {
    return NextResponse.json({ message: "Entrada no encontrada" }, { status: 404 });
  }

  const isOwner = existing.authorId === actor.userId;
  const isManager = canModerateBitacora(actor.role);
  if (!isOwner && !isManager) {
    return NextResponse.json({ message: "Sin permisos para eliminar esta entrada" }, { status: 403 });
  }

  await prisma.bitacoraEntry.delete({ where: { id: entryId } });

  await writeAuditEvent({
    userId: actor.userId,
    action: "bitacora.deleted",
    detail: entryId,
  });

  return NextResponse.json({ ok: true });
}
