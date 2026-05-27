import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { publishTicketEvent } from "@/lib/tickets-events";

const deleteSchema = z.object({
  reason: z.string().trim().min(5, "Motivo demasiado corto (mínimo 5 caracteres)").max(500),
});

type AttachmentMetaRow = {
  id: string;
  mimeType: string | null;
  sizeBytes: number | null;
  diskFileName: string | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await resolveRequestActor(_request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }

    await ensureCatalogSeeded();
    const { ticketId } = await context.params;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        bus: true,
        asset: true,
        assignedTo: { select: { id: true, name: true } },
        comments: { orderBy: { createdAt: "desc" } },
        attachments: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!ticket) {
      return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
    }

    const attachmentIds = ticket.attachments.map((a) => a.id);
    const metaById = new Map<string, AttachmentMetaRow>();
    if (attachmentIds.length > 0) {
      const rows = await prisma.$queryRaw<AttachmentMetaRow[]>`
        SELECT "id", "mimeType", "sizeBytes", "diskFileName"
        FROM "TicketAttachment"
        WHERE "id" IN (${Prisma.join(attachmentIds)})
      `;
      for (const row of rows) {
        metaById.set(row.id, row);
      }
    }

    return NextResponse.json({
      role: actor.role,
      actorName: actor.displayName,
      ticket: {
        id: ticket.id,
        busId: ticket.busId,
        assetId: ticket.assetId,
        assetType: ticket.asset.type,
        tipo: ticket.tipo,
        subtipo: ticket.subtipo,
        subsubtipo: ticket.subsubtipo,
        dominio: ticket.dominio,
        nivelImpacto: ticket.nivelImpacto,
        origenTecnico: ticket.origenTecnico,
        observaciones: ticket.observaciones,
        operator: ticket.bus.operator,
        municipio: ticket.mapPlaceMunicipio?.trim() || ticket.bus.municipio,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        slaDeadline: ticket.slaDeadline.toISOString(),
        latitude: ticket.latitude ?? null,
        longitude: ticket.longitude ?? null,
        assignedToUserId: ticket.assignedToUserId ?? null,
        assignedToUserName: ticket.assignedTo?.name ?? null,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        attachments: ticket.attachments.map((a) => {
          const meta = metaById.get(a.id);
          const diskFileName = meta?.diskFileName ?? null;
          return {
            id: a.id,
            fileName: a.fileName,
            mimeType: meta?.mimeType ?? null,
            sizeBytes: meta?.sizeBytes ?? null,
            downloadUrl: diskFileName ? `/api/tickets/attachments/${a.id}` : null,
          };
        }),
        comments: ticket.comments.map((comment) => ({
          id: comment.id,
          author: comment.author,
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Error loading ticket:", error);
    return NextResponse.json({ message: "No se pudo cargar el ticket" }, { status: 500 });
  }
}

/**
 * Borrar un ticket. Solo técnicos de campo y gestores.
 *
 * El motivo es **obligatorio** (mín. 5 caracteres) y se preserva en AuditEvent
 * antes de eliminar el ticket — así el registro sobrevive al borrado aunque la
 * FK del AuditEvent pase a NULL.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }
    if (actor.role !== "tecnico_campo" && actor.role !== "gestor_centro_control") {
      return NextResponse.json({ message: "Sin permisos para eliminar tickets" }, { status: 403 });
    }

    const { ticketId } = await context.params;
    const payload = await request.json().catch(() => ({}));
    const parsed = deleteSchema.safeParse(payload);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Datos inválidos";
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { bus: { select: { id: true } } },
    });
    if (!ticket) {
      return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
    }

    // Auditamos primero (con todos los datos relevantes) y luego borramos.
    const shortId = ticket.id.slice(-8).toUpperCase();
    await writeAuditEvent({
      userId: actor.userId,
      action: "ticket.deleted",
      detail: `Eliminó ticket ${shortId} (bus ${ticket.busId}, "${ticket.title}", estado ${ticket.status}). Motivo: ${parsed.data.reason}`,
    });

    // El schema tiene cascade en comentarios/adjuntos/reservas; auditEvent.ticketId
    // pasa a NULL por SetNull. Borrado seguro.
    await prisma.ticket.delete({ where: { id: ticketId } });

    publishTicketEvent("ticket_deleted", {
      id: ticket.id,
      busId: ticket.busId,
      status: ticket.status,
      priority: ticket.priority,
      title: ticket.title,
      assignedToUserId: ticket.assignedToUserId,
      by: actor.displayName,
    });

    return NextResponse.json({ ok: true, deletedId: ticketId });
  } catch (error) {
    console.error("Error deleting ticket:", error);
    return NextResponse.json({ message: "No se pudo eliminar el ticket" }, { status: 500 });
  }
}
