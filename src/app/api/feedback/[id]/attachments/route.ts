/**
 * Sube adjuntos (capturas) a un reporte de feedback existente.
 *
 * Política mínima: solo el AUTOR del feedback puede añadir adjuntos a su
 * propio reporte (en pleno flujo de envío). Los administradores con
 * `canReviewFeedback` pueden ver/listar, pero no añadir en nombre del
 * usuario (sería confuso para el historial).
 *
 * Se ejecuta tras el POST inicial a `/api/feedback` que devolvió el `id`.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import {
  FEEDBACK_UPLOAD_MAX_FILES,
  FEEDBACK_UPLOAD_MAX_IMAGE_BYTES,
  FEEDBACK_UPLOAD_MAX_TOTAL_BYTES,
  isAcceptedFeedbackImage,
} from "@/lib/feedback-uploads";
import { saveFeedbackUploadFiles } from "@/lib/feedback-uploads-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }

    const { id } = await context.params;
    const feedback = await prisma.userFeedback.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!feedback) {
      return NextResponse.json({ message: "Feedback no encontrado" }, { status: 404 });
    }
    if (feedback.userId !== actor.userId) {
      return NextResponse.json(
        { message: "Solo el autor puede añadir adjuntos a su feedback" },
        { status: 403 },
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ message: "Se esperaba multipart/form-data" }, { status: 400 });
    }

    const formData = await request.formData();
    const files: File[] = [];
    for (const entry of formData.getAll("files")) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        "arrayBuffer" in entry &&
        "size" in entry
      ) {
        const f = entry as File;
        if (f.size > 0) files.push(f);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ message: "Sin archivos para subir" }, { status: 400 });
    }
    if (files.length > FEEDBACK_UPLOAD_MAX_FILES) {
      return NextResponse.json(
        { message: `Máximo ${FEEDBACK_UPLOAD_MAX_FILES} archivos por subida` },
        { status: 400 },
      );
    }

    let combinedBytes = 0;
    for (const f of files) {
      if (!isAcceptedFeedbackImage(f.type, f.name)) {
        return NextResponse.json(
          { message: "Tipo no permitido: solo imágenes (jpg, png, webp, gif)." },
          { status: 400 },
        );
      }
      if (f.size > FEEDBACK_UPLOAD_MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { message: "La imagen supera el límite por archivo (5 MB)." },
          { status: 400 },
        );
      }
      combinedBytes += f.size;
    }
    if (combinedBytes > FEEDBACK_UPLOAD_MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { message: "Tamaño combinado superior al permitido (25 MB)." },
        { status: 400 },
      );
    }

    const { saved } = await saveFeedbackUploadFiles(feedback.id, files);
    return NextResponse.json({ ok: true, count: saved });
  } catch (error) {
    console.error("Error añadiendo adjuntos al feedback:", error);
    return NextResponse.json(
      { message: "No se pudo guardar el adjunto" },
      { status: 500 },
    );
  }
}
