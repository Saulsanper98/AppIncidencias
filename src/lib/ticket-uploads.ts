import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import { prisma } from "@/lib/prisma";

/**
 * Política de adjuntos de ticket.
 *
 * Pensada para un equipo de centro de control que sube fotos breves (caja,
 * panel, ticket impreso) o **clips cortos de vídeo** del incidente. El
 * servidor corre con almacenamiento local bajo `public/uploads/...` y no
 * dispone de CDN, por lo que los límites están escogidos para evitar que
 * varios usuarios saturen disco/RAM enviando vídeos largos en HD.
 *
 * Cualquier cambio aquí debe coordinarse con `tickets-module-types.ts` para
 * que cliente y servidor compartan los mismos umbrales.
 */

/** Máximo de archivos por ticket (cualquier mezcla de imagen + vídeo). */
export const TICKET_UPLOAD_MAX_FILES = 6;

/** Bytes máximos por imagen (5 MB). */
export const TICKET_UPLOAD_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Bytes máximos por vídeo (40 MB). */
export const TICKET_UPLOAD_MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** Tamaño combinado máximo de la subida (120 MB). */
export const TICKET_UPLOAD_MAX_TOTAL_BYTES = 120 * 1024 * 1024;

/** MIME aceptados para imagen. */
export const TICKET_UPLOAD_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * MIME aceptados para vídeo. MOV (`video/quicktime`) cubre las grabaciones
 * por defecto de iPhone; el resto son los formatos universales del web.
 */
export const TICKET_UPLOAD_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska", // poco común, pero se libera por tolerancia
]);

/**
 * Atributo `accept` para `<input type="file">`. Combina MIME explícitos y
 * extensiones comunes para móviles, donde el MIME a veces llega vacío.
 */
export const TICKET_UPLOAD_ACCEPT =
  "image/*,video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv";

export type TicketUploadKind = "image" | "video";

/** Devuelve el tipo de un archivo según su MIME o `null` si no se acepta. */
export function classifyTicketUploadFile(mime: string, fileName: string): TicketUploadKind | null {
  const m = (mime || "").toLowerCase();
  if (TICKET_UPLOAD_IMAGE_MIME.has(m) || m.startsWith("image/")) return "image";
  if (TICKET_UPLOAD_VIDEO_MIME.has(m)) return "video";
  // Fallback: detectar por extensión cuando el MIME falla (Safari móvil suele
  // mandar string vacío al subir desde la cámara).
  const ext = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if ([".mp4", ".webm", ".mov", ".mkv"].includes(ext)) return "video";
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return "image";
  return null;
}

/** Devuelve el límite por archivo en bytes según el tipo. */
export function ticketUploadByteLimit(kind: TicketUploadKind): number {
  return kind === "video" ? TICKET_UPLOAD_MAX_VIDEO_BYTES : TICKET_UPLOAD_MAX_IMAGE_BYTES;
}

export function fileExtFromMimeAndName(mime: string, originalName: string): string {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return ".jpg";
  if (m === "image/png") return ".png";
  if (m === "image/webp") return ".webp";
  if (m === "image/gif") return ".gif";
  if (m === "video/mp4") return ".mp4";
  if (m === "video/webm") return ".webm";
  if (m === "video/quicktime") return ".mov";
  if (m === "video/x-matroska") return ".mkv";
  const extMatch = originalName.match(/(\.[a-zA-Z0-9]{1,8})$/);
  if (extMatch) return extMatch[1].toLowerCase();
  return ".bin";
}

/**
 * Guarda binarios en disco y filas en BD. Usa `$executeRaw` para el INSERT de adjuntos
 * porque en Windows `prisma generate` a veces falla (EPERM) con el dev server en marcha
 * y el cliente generado queda sin `mimeType` / `sizeBytes` aunque la migración sí exista.
 *
 * Esta función ya asume que el caller validó los archivos (tipo, tamaño y
 * conteo) — aquí únicamente filtramos por seguridad básica para no escribir
 * basura al disco.
 */
export async function saveTicketUploadFiles(ticketId: string, files: File[]): Promise<void> {
  const dir = join(process.cwd(), "public", "uploads", "tickets", ticketId);
  await mkdir(dir, { recursive: true });

  for (const file of files.slice(0, TICKET_UPLOAD_MAX_FILES)) {
    if (file.size <= 0) continue;
    const kind = classifyTicketUploadFile(file.type, file.name);
    if (!kind) continue;
    if (file.size > ticketUploadByteLimit(kind)) continue;

    const fileName = file.name?.trim() || (kind === "video" ? "video" : "adjunto");
    const mimeType = file.type || (kind === "video" ? "video/mp4" : "application/octet-stream");
    const sizeBytes = file.size;
    const id = randomUUID();
    const ext = fileExtFromMimeAndName(mimeType, fileName);
    const diskFileName = `${id}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(join(dir, diskFileName), buf);

    await prisma.$executeRaw`
      INSERT INTO "TicketAttachment" ("id", "ticketId", "fileName", "mimeType", "sizeBytes", "diskFileName")
      VALUES (${id}, ${ticketId}, ${fileName}, ${mimeType}, ${sizeBytes}, ${diskFileName})
    `;
  }
}
