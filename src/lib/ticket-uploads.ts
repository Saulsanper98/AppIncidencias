import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import { prisma } from "@/lib/prisma";

export const TICKET_UPLOAD_MAX_FILES = 8;
export const TICKET_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export function fileExtFromMimeAndName(mime: string, originalName: string): string {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return ".jpg";
  if (m === "image/png") return ".png";
  if (m === "image/webp") return ".webp";
  if (m === "image/gif") return ".gif";
  const extMatch = originalName.match(/(\.[a-zA-Z0-9]{1,8})$/);
  if (extMatch) return extMatch[1].toLowerCase();
  return ".bin";
}

/**
 * Guarda binarios en disco y filas en BD. Usa `$executeRaw` para el INSERT de adjuntos
 * porque en Windows `prisma generate` a veces falla (EPERM) con el dev server en marcha
 * y el cliente generado queda sin `mimeType` / `sizeBytes` aunque la migración sí exista.
 */
export async function saveTicketUploadFiles(ticketId: string, files: File[]): Promise<void> {
  const dir = join(process.cwd(), "public", "uploads", "tickets", ticketId);
  await mkdir(dir, { recursive: true });

  for (const file of files.slice(0, TICKET_UPLOAD_MAX_FILES)) {
    if (file.size <= 0 || file.size > TICKET_UPLOAD_MAX_BYTES) continue;
    if (!file.type.startsWith("image/")) continue;

    const fileName = file.name?.trim() || "adjunto";
    const mimeType = file.type || "application/octet-stream";
    const sizeBytes = file.size;
    const id = randomUUID();
    const ext = fileExtFromMimeAndName(file.type, file.name);
    const diskFileName = `${id}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(join(dir, diskFileName), buf);

    await prisma.$executeRaw`
      INSERT INTO "TicketAttachment" ("id", "ticketId", "fileName", "mimeType", "sizeBytes", "diskFileName")
      VALUES (${id}, ${ticketId}, ${fileName}, ${mimeType}, ${sizeBytes}, ${diskFileName})
    `;
  }
}
