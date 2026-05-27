/**
 * Sube adjuntos (fotos / vídeos) a un ticket existente.
 *
 * Se usa el mismo motor de validación que el POST de `/api/tickets` (límites
 * por archivo, MIME aceptados, máximo combinado). Tras guardar publica un
 * `ticket_updated` para que el detalle se refresque en vivo en todas las
 * sesiones que lo tengan abierto.
 *
 * El runtime se fija a Node y se permiten 120 s para subidas largas (vídeos).
 */

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canUploadAttachment } from "@/lib/rbac";
import {
  TICKET_UPLOAD_MAX_FILES,
  TICKET_UPLOAD_MAX_TOTAL_BYTES,
  classifyTicketUploadFile,
  saveTicketUploadFiles,
  ticketUploadByteLimit,
} from "@/lib/ticket-uploads";
import { publishTicketEvent } from "@/lib/tickets-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }
    if (!canUploadAttachment(actor.role)) {
      return NextResponse.json(
        { message: "Rol sin permisos para subir adjuntos" },
        { status: 403 },
      );
    }

    const { ticketId } = await context.params;
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        busId: true,
        title: true,
        status: true,
        priority: true,
        assignedToUserId: true,
      },
    });
    if (!ticket) {
      return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { message: "Se esperaba multipart/form-data" },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const uploadedFiles: File[] = [];
    for (const entry of formData.getAll("files")) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        "arrayBuffer" in entry &&
        "size" in entry
      ) {
        const f = entry as File;
        if (f.size > 0) uploadedFiles.push(f);
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json({ message: "Sin archivos para subir" }, { status: 400 });
    }

    // No queremos que un solo usuario pueda añadir más de TICKET_UPLOAD_MAX_FILES
    // por petición. (Si en el futuro queremos contar los ya existentes del
    // ticket, lo añadiremos: hoy mismo el form de creación impone el mismo
    // límite y para una segunda tanda nos parece aceptable.)
    if (uploadedFiles.length > TICKET_UPLOAD_MAX_FILES) {
      return NextResponse.json(
        { message: `Máximo ${TICKET_UPLOAD_MAX_FILES} archivos por subida` },
        { status: 400 },
      );
    }

    let combinedBytes = 0;
    for (const f of uploadedFiles) {
      const kind = classifyTicketUploadFile(f.type, f.name);
      if (!kind) {
        return NextResponse.json(
          {
            message:
              "Tipo no permitido: solo imágenes (jpg, png, webp, gif) o vídeos (mp4, webm, mov).",
          },
          { status: 400 },
        );
      }
      const limit = ticketUploadByteLimit(kind);
      if (f.size > limit) {
        return NextResponse.json(
          {
            message:
              kind === "video"
                ? "El vídeo supera el límite por archivo (40 MB)."
                : "La imagen supera el límite por archivo (5 MB).",
          },
          { status: 400 },
        );
      }
      combinedBytes += f.size;
    }
    if (combinedBytes > TICKET_UPLOAD_MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { message: "Tamaño combinado superior al permitido (120 MB)." },
        { status: 400 },
      );
    }

    await saveTicketUploadFiles(ticket.id, uploadedFiles);

    await writeAuditEvent({
      userId: actor.userId,
      ticketId: ticket.id,
      action: "ticket.attachment_added",
      detail: `${actor.displayName} subió ${uploadedFiles.length} adjunto(s)`,
    });

    publishTicketEvent("ticket_updated", {
      id: ticket.id,
      busId: ticket.busId,
      status: ticket.status,
      priority: ticket.priority,
      title: ticket.title,
      assignedToUserId: ticket.assignedToUserId,
      by: actor.displayName,
    });

    return NextResponse.json({ ok: true, count: uploadedFiles.length });
  } catch (error) {
    console.error("Error añadiendo adjuntos:", error);
    return NextResponse.json(
      { message: "No se pudo guardar el adjunto" },
      { status: 500 },
    );
  }
}
