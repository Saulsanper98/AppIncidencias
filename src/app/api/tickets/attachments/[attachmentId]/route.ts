import { readFile } from "fs/promises";
import { join } from "path";

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }

    const { attachmentId } = await context.params;
    type Row = {
      id: string;
      ticketId: string;
      fileName: string;
      diskFileName: string | null;
      mimeType: string | null;
    };
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "id", "ticketId", "fileName", "diskFileName", "mimeType"
      FROM "TicketAttachment"
      WHERE "id" = ${attachmentId}
      LIMIT 1
    `;
    const attachment = rows[0];

    if (!attachment?.diskFileName) {
      return NextResponse.json({ message: "Adjunto no encontrado" }, { status: 404 });
    }

    const path = join(process.cwd(), "public", "uploads", "tickets", attachment.ticketId, attachment.diskFileName);
    const buffer = await readFile(path);
    const mime = attachment.mimeType || "application/octet-stream";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving attachment:", error);
    return NextResponse.json({ message: "No se pudo leer el adjunto" }, { status: 500 });
  }
}
