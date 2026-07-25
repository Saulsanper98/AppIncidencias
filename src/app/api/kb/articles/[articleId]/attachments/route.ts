import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import {
  KB_UPLOAD_MAX_FILES,
  KB_UPLOAD_MAX_TOTAL_BYTES,
  isAcceptedKbUpload,
  kbMediaKind,
  kbMediaMaxBytes,
} from "@/lib/kb-uploads";
import { saveKbUploadFiles } from "@/lib/kb-uploads-server";
import { prisma } from "@/lib/prisma";
import { canManageKnowledge } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: { params: Promise<{ articleId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }
    if (!canManageKnowledge(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para editar la KB" }, { status: 403 });
    }

    const { articleId } = await context.params;
    const article = await prisma.kbArticle.findUnique({
      where: { id: articleId },
      select: { id: true },
    });
    if (!article) {
      return NextResponse.json({ message: "Artículo no encontrado" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ message: "Se esperaba multipart/form-data" }, { status: 400 });
    }

    const formData = await request.formData();
    const files: File[] = [];
    for (const entry of formData.getAll("files")) {
      if (typeof entry === "object" && entry !== null && "arrayBuffer" in entry && "size" in entry) {
        const f = entry as File;
        if (f.size > 0) files.push(f);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ message: "Sin archivos para subir" }, { status: 400 });
    }
    if (files.length > KB_UPLOAD_MAX_FILES) {
      return NextResponse.json(
        { message: `Máximo ${KB_UPLOAD_MAX_FILES} archivos por subida` },
        { status: 400 },
      );
    }

    let combinedBytes = 0;
    for (const f of files) {
      const name = f.name?.trim() || "archivo";
      if (!isAcceptedKbUpload(f.type, name)) {
        return NextResponse.json(
          {
            message:
              "Tipo no permitido. Usa imágenes (jpg, png, webp, gif), vídeos (mp4, webm, mov) o PDF.",
          },
          { status: 400 },
        );
      }
      const kind = kbMediaKind(f.type, name)!;
      if (f.size > kbMediaMaxBytes(kind)) {
        const mb = Math.round(kbMediaMaxBytes(kind) / (1024 * 1024));
        return NextResponse.json(
          { message: `«${name}» supera el límite de ${mb} MB para este tipo.` },
          { status: 400 },
        );
      }
      combinedBytes += f.size;
    }
    if (combinedBytes > KB_UPLOAD_MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { message: "Tamaño combinado superior al permitido (120 MB)." },
        { status: 400 },
      );
    }

    const { saved } = await saveKbUploadFiles(articleId, files);
    if (saved.length === 0) {
      return NextResponse.json({ message: "No se pudo guardar ningún archivo" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, files: saved });
  } catch (error) {
    console.error("Error subiendo medios KB:", error);
    return NextResponse.json({ message: "No se pudo guardar el archivo" }, { status: 500 });
  }
}
