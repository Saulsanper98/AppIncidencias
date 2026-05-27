/**
 * Eliminar una vista guardada. Solo el dueño puede borrarla.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ viewId: string }> };

export async function DELETE(request: Request, { params }: RouteParams) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  const { viewId } = await params;
  const view = await prisma.savedTicketView.findUnique({ where: { id: viewId } });
  if (!view) {
    return NextResponse.json({ message: "Vista no encontrada" }, { status: 404 });
  }
  if (view.userId !== actor.userId) {
    return NextResponse.json({ message: "No autorizado" }, { status: 403 });
  }

  await prisma.savedTicketView.delete({ where: { id: view.id } });
  return NextResponse.json({ ok: true });
}
