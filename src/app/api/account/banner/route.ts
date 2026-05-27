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
      url = await saveAccountImage(actor.userId, "banner", file);
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "No se pudo subir la imagen." },
        { status: 400 },
      );
    }

    const previous = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { name: true, bannerUrl: true },
    });

    await prisma.user.update({
      where: { id: actor.userId },
      data: { bannerUrl: url },
    });

    if (previous?.bannerUrl) {
      void tryDeleteLocalAccountImage(previous.bannerUrl);
    }

    await writeAuditEvent({
      userId: actor.userId,
      action: "account.upload_banner",
      detail: `${previous?.name ?? "Usuario"} subió un banner (${file.size} bytes, ${file.type})`,
    });

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error("Error uploading banner:", error);
    return NextResponse.json({ message: "No se pudo subir el banner" }, { status: 500 });
  }
}
