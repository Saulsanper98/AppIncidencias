import { createReadStream } from "fs";
import { readFile, stat, unlink } from "fs/promises";
import { join } from "path";

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canDeleteAttachment } from "@/lib/rbac";
import { publishTicketEvent } from "@/lib/tickets-events";

// Servimos binarios (incluidos vídeos) desde Node; Edge no permite streaming
// con `fs` y limita el body a 4 MB.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AttachmentRow = {
  id: string;
  ticketId: string;
  fileName: string;
  diskFileName: string | null;
  mimeType: string | null;
};

/**
 * Convierte un `ReadableStream` Node a Web `ReadableStream` para que
 * `NextResponse` lo pueda consumir sin cargar el archivo entero en RAM.
 * Sirve para que los `<video>` puedan hacer seek con HTTP Range.
 */
function nodeStreamToWebStream(path: string, start: number, end: number): ReadableStream<Uint8Array> {
  const node = createReadStream(path, { start, end });
  return new ReadableStream<Uint8Array>({
    start(controller) {
      node.on("data", (chunk) => {
        const buf =
          typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
        controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      });
      node.on("end", () => controller.close());
      node.on("error", (error) => controller.error(error));
    },
    cancel() {
      node.destroy();
    },
  });
}

function parseRangeHeader(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const startStr = match[1];
  const endStr = match[2];
  let start = startStr ? parseInt(startStr, 10) : NaN;
  let end = endStr ? parseInt(endStr, 10) : NaN;
  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  if (Number.isNaN(start)) {
    // Sufijo: "bytes=-N" → últimos N bytes.
    const suffix = end;
    if (suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }
  if (start > end || start < 0 || end >= size) return null;
  return { start, end };
}

export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }

    const { attachmentId } = await context.params;
    const rows = await prisma.$queryRaw<AttachmentRow[]>`
      SELECT "id", "ticketId", "fileName", "diskFileName", "mimeType"
      FROM "TicketAttachment"
      WHERE "id" = ${attachmentId}
      LIMIT 1
    `;
    const attachment = rows[0];

    if (!attachment?.diskFileName) {
      return NextResponse.json({ message: "Adjunto no encontrado" }, { status: 404 });
    }

    const path = join(
      process.cwd(),
      "public",
      "uploads",
      "tickets",
      attachment.ticketId,
      attachment.diskFileName,
    );

    let stats;
    try {
      stats = await stat(path);
    } catch {
      return NextResponse.json({ message: "Archivo no encontrado en disco" }, { status: 404 });
    }
    const totalSize = stats.size;
    const mime = attachment.mimeType || "application/octet-stream";
    const isVideo = mime.startsWith("video/");
    const filenameHeader = `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`;

    const range = parseRangeHeader(request.headers.get("range"), totalSize);
    if (range) {
      const { start, end } = range;
      const chunkSize = end - start + 1;
      const stream = nodeStreamToWebStream(path, start, end);
      return new NextResponse(stream, {
        status: 206,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": filenameHeader,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    // Sin Range: para vídeos seguimos respondiendo en streaming (los
    // navegadores también pueden empezar a reproducir con la respuesta
    // completa). Para imágenes pequeñas leemos directamente.
    if (isVideo) {
      const stream = nodeStreamToWebStream(path, 0, totalSize - 1);
      return new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(totalSize),
          "Accept-Ranges": "bytes",
          "Content-Disposition": filenameHeader,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const buffer = await readFile(path);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Accept-Ranges": "bytes",
        "Content-Disposition": filenameHeader,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving attachment:", error);
    return NextResponse.json({ message: "No se pudo leer el adjunto" }, { status: 500 });
  }
}

/**
 * Borra un adjunto (registro en BD + fichero en disco).
 *
 * Permisos: solo roles con `canDeleteAttachment`. Operación idempotente: si
 * el fichero en disco ya no existe lo ignoramos pero igualmente borramos la
 * fila para que no queden adjuntos huérfanos en la UI.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }
    if (!canDeleteAttachment(actor.role)) {
      return NextResponse.json(
        { message: "Sin permisos para eliminar adjuntos" },
        { status: 403 },
      );
    }

    const { attachmentId } = await context.params;
    const rows = await prisma.$queryRaw<AttachmentRow[]>`
      SELECT "id", "ticketId", "fileName", "diskFileName", "mimeType"
      FROM "TicketAttachment"
      WHERE "id" = ${attachmentId}
      LIMIT 1
    `;
    const attachment = rows[0];
    if (!attachment) {
      return NextResponse.json({ message: "Adjunto no encontrado" }, { status: 404 });
    }

    // Borrar fichero en disco (si existe).
    if (attachment.diskFileName) {
      const diskPath = join(
        process.cwd(),
        "public",
        "uploads",
        "tickets",
        attachment.ticketId,
        attachment.diskFileName,
      );
      try {
        await unlink(diskPath);
      } catch {
        // El fichero podría haberse perdido en una limpieza manual: ignoramos
        // y seguimos con el borrado de BD.
      }
    }

    await prisma.ticketAttachment.delete({ where: { id: attachmentId } });

    await writeAuditEvent({
      userId: actor.userId,
      ticketId: attachment.ticketId,
      action: "ticket.attachment_deleted",
      detail: `${actor.displayName} eliminó adjunto "${attachment.fileName}"`,
    });

    // Necesitamos el ticket para construir el payload SSE (busId, status…).
    const ticket = await prisma.ticket.findUnique({
      where: { id: attachment.ticketId },
      select: {
        id: true,
        busId: true,
        status: true,
        priority: true,
        title: true,
        assignedToUserId: true,
      },
    });
    if (ticket) {
      publishTicketEvent("ticket_updated", {
        id: ticket.id,
        busId: ticket.busId,
        status: ticket.status,
        priority: ticket.priority,
        title: ticket.title,
        assignedToUserId: ticket.assignedToUserId,
        by: actor.displayName,
      });
    }

    return NextResponse.json({ ok: true, deletedId: attachmentId });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    return NextResponse.json(
      { message: "No se pudo eliminar el adjunto" },
      { status: 500 },
    );
  }
}
