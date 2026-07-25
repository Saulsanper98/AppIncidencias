import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { saveBusPhoto } from "@/lib/bus-uploads";
import { prisma } from "@/lib/prisma";
import { canEditBusDetail } from "@/lib/rbac";

export async function POST(
  request: Request,
  context: { params: Promise<{ busId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canEditBusDetail(actor.role)) {
      return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
    }

    const { busId: rawId } = await context.params;
    const busId = decodeURIComponent(rawId).trim();
    const bus = await prisma.bus.findUnique({ where: { id: busId }, select: { id: true } });
    if (!bus) {
      return NextResponse.json({ message: "Bus no encontrado" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Archivo requerido" }, { status: 400 });
    }

    const captionRaw = form.get("caption");
    const caption =
      typeof captionRaw === "string" && captionRaw.trim() ? captionRaw.trim().slice(0, 200) : null;

    const url = await saveBusPhoto(busId, file);
    const count = await prisma.busPhoto.count({ where: { busId } });
    const photo = await prisma.busPhoto.create({
      data: { busId, url, caption, sortOrder: count },
    });

    return NextResponse.json(
      {
        photo: {
          id: photo.id,
          url: photo.url,
          caption: photo.caption,
          sortOrder: photo.sortOrder,
          createdAt: photo.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo subir la foto";
    console.error("Error uploading bus photo:", error);
    return NextResponse.json({ message }, { status: 400 });
  }
}
