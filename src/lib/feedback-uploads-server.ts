import "server-only";

/**
 * Operaciones de adjuntos de feedback que SOLO pueden correr en Node:
 * escribir ficheros en disco e insertar filas en BD.
 *
 * Importa las constantes y helpers PURE desde `feedback-uploads.ts`
 * (ese módulo sí es seguro para cliente).
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import {
  FEEDBACK_UPLOAD_MAX_FILES,
  FEEDBACK_UPLOAD_MAX_IMAGE_BYTES,
  isAcceptedFeedbackImage,
} from "@/lib/feedback-uploads";
import { prisma } from "@/lib/prisma";

function fileExt(mime: string, originalName: string): string {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return ".jpg";
  if (m === "image/png") return ".png";
  if (m === "image/webp") return ".webp";
  if (m === "image/gif") return ".gif";
  const extMatch = originalName.match(/(\.[a-zA-Z0-9]{1,8})$/);
  if (extMatch) return extMatch[1].toLowerCase();
  return ".png";
}

/**
 * Persiste los ficheros válidos en disco y crea filas en
 * `FeedbackAttachment`. Usamos `$executeRaw` para el INSERT por la misma
 * razón que en `ticket-uploads.ts`: en Windows `prisma generate` puede
 * quedar a medias si el servicio está sirviendo y la regeneración del
 * cliente no expone el nuevo modelo hasta el siguiente arranque.
 *
 * Se ignoran archivos vacíos o que pasen los límites. El caller ya debe
 * haber validado conteo y tamaños globales.
 */
export async function saveFeedbackUploadFiles(
  feedbackId: string,
  files: File[],
): Promise<{ saved: number }> {
  const dir = join(process.cwd(), "public", "uploads", "feedback", feedbackId);
  await mkdir(dir, { recursive: true });

  let saved = 0;
  for (const file of files.slice(0, FEEDBACK_UPLOAD_MAX_FILES)) {
    if (file.size <= 0) continue;
    if (!isAcceptedFeedbackImage(file.type, file.name)) continue;
    if (file.size > FEEDBACK_UPLOAD_MAX_IMAGE_BYTES) continue;

    const fileName = file.name?.trim() || "captura.png";
    const mimeType = file.type || "image/png";
    const sizeBytes = file.size;
    const id = randomUUID();
    const ext = fileExt(mimeType, fileName);
    const diskFileName = `${id}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(join(dir, diskFileName), buf);

    await prisma.$executeRaw`
      INSERT INTO "FeedbackAttachment" ("id", "feedbackId", "fileName", "mimeType", "sizeBytes", "diskFileName", "createdAt")
      VALUES (${id}, ${feedbackId}, ${fileName}, ${mimeType}, ${sizeBytes}, ${diskFileName}, CURRENT_TIMESTAMP)
    `;
    saved += 1;
  }
  return { saved };
}
