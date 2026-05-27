import { NextResponse } from "next/server";

import {
  saveAccountImage,
  tryDeleteLocalAccountImage,
} from "@/lib/account-uploads";
import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Sesion requerida" }, { status: 401 });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ message: "Adjunta una imagen en el campo 'file'." }, { status: 400 });
    }

    let url: string;
    try {
      url = await saveAccountImage(actor.userId, "avatar", file);
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "No se pudo subir la imagen." },
        { status: 400 },
      );
    }

    const previous = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { name: true, avatarUrl: true },
    });

    await prisma.user.update({
      where: { id: actor.userId },
      data: { avatarUrl: url },
    });

    // Si había un avatar local anterior, lo borramos en background para no acumular.
    if (previous?.avatarUrl) {
      void tryDeleteLocalAccountImage(previous.avatarUrl);
    }

    await writeAuditEvent({
      userId: actor.userId,
      action: "account.upload_avatar",
      detail: `${previous?.name ?? "Usuario"} subió un avatar (${file.size} bytes, ${file.type})`,
    });

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error("Error uploading avatar:", error);
    return NextResponse.json({ message: "No se pudo subir el avatar" }, { status: 500 });
  }
}
