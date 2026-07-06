import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { tryDeleteLocalBusPhoto } from "@/lib/bus-uploads";
import { prisma } from "@/lib/prisma";
import { canEditBusDetail } from "@/lib/rbac";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ busId: string; photoId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canEditBusDetail(actor.role)) {
      return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
    }

    const { busId: rawBusId, photoId } = await context.params;
    const busId = decodeURIComponent(rawBusId).trim();

    const photo = await prisma.busPhoto.findFirst({
      where: { id: photoId, busId },
    });
    if (!photo) {
      return NextResponse.json({ message: "Foto no encontrada" }, { status: 404 });
    }

    await tryDeleteLocalBusPhoto(photo.url);
    await prisma.busPhoto.delete({ where: { id: photo.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting bus photo:", error);
    return NextResponse.json({ message: "No se pudo eliminar la foto" }, { status: 500 });
  }
}
