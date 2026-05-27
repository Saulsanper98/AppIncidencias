/**
 * Marca un anuncio como leído por el usuario actual. Idempotente:
 * si ya estaba marcado, devuelve 200 sin tocar nada.
 *
 *   POST   /api/announcements/[id]/read   → marca leído
 *   DELETE /api/announcements/[id]/read   → desmarca (vuelve a "no leído")
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const exists = await prisma.announcement.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ message: "No encontrado" }, { status: 404 });
    }

    await prisma.announcementRead.upsert({
      where: { userId_announcementId: { userId: actor.userId, announcementId: id } },
      create: { userId: actor.userId, announcementId: id },
      update: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error marking announcement read:", error);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    await prisma.announcementRead
      .delete({
        where: { userId_announcementId: { userId: actor.userId, announcementId: id } },
      })
      .catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error unmarking announcement read:", error);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}
