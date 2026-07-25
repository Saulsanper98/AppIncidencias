import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { canEditResolvedTicketRecord, canEditTicketRecord, canSoftDeleteTicket } from "@/lib/rbac";
import { CatalogIdFormatError, collectOperatorPrefixes, validateOptionalLineaLabel } from "@/lib/catalog-id-format";
import { deleteTicketWithAudit } from "@/lib/ticket-delete";
import { resolveBusAndAssetForTicket } from "@/lib/ticket-bus-asset";
import { summarizeTicketFieldChanges, updateTicketSchema } from "@/lib/ticket-patch";
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
        lineaLabel: ticket.lineaLabel ?? null,
        servicioLabel: ticket.servicioLabel ?? null,
        conductorLabel: ticket.conductorLabel ?? null,
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
        incidentOccurredAt: ticket.incidentOccurredAt?.toISOString() ?? null,
        needsCompletion: ticket.needsCompletion,
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }

    await ensureCatalogSeeded();
    const { ticketId } = await context.params;

    const existing = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { bus: true, asset: true },
    });
    if (!existing) {
      return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
    }

    if (!canEditTicketRecord(actor.role, actor.userId, existing, actor.isReadOnly)) {
      return NextResponse.json({ message: "Rol sin permisos para corregir este ticket" }, { status: 403 });
    }

    if (
      existing.status === "resuelto" &&
      !canEditResolvedTicketRecord(actor.role, actor.userId, existing, actor.isReadOnly)
    ) {
      return NextResponse.json(
        { message: "Los tickets resueltos solo pueden corregirse si te pertenecen o por un gestor" },
        { status: 403 },
      );
    }

    const payload = await request.json();
    const parsed = updateTicketSchema.safeParse(payload);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Datos inválidos";
      return NextResponse.json({ message: firstError }, { status: 400 });
    }

    const { reason, busId: newBusId, assetId: newAssetId, ...fields } = parsed.data;

    const data: Prisma.TicketUpdateInput = {};
    const trackedKeys: string[] = [];

    if (fields.title !== undefined) {
      data.title = fields.title;
      trackedKeys.push("title");
    }
    if (fields.description !== undefined) {
      data.description = fields.description;
      trackedKeys.push("description");
    }
    if (fields.tipo !== undefined) {
      data.tipo = fields.tipo;
      trackedKeys.push("tipo");
    }
    if (fields.subtipo !== undefined) {
      data.subtipo = fields.subtipo;
      trackedKeys.push("subtipo");
    }
    if (fields.subsubtipo !== undefined) {
      data.subsubtipo = fields.subsubtipo;
      trackedKeys.push("subsubtipo");
    }
    if (fields.dominio !== undefined) {
      data.dominio = fields.dominio;
      trackedKeys.push("dominio");
    }
    if (fields.nivelImpacto !== undefined) {
      data.nivelImpacto = fields.nivelImpacto;
      trackedKeys.push("nivelImpacto");
    }
    if (fields.origenTecnico !== undefined) {
      data.origenTecnico = fields.origenTecnico;
      trackedKeys.push("origenTecnico");
    }
    if (fields.observaciones !== undefined) {
      data.observaciones = fields.observaciones;
      trackedKeys.push("observaciones");
    }
    if (fields.lineaLabel !== undefined) {
      const [lineaRows, busRows] = await Promise.all([
        prisma.linea.findMany({ select: { id: true } }),
        prisma.bus.findMany({ select: { id: true } }),
      ]);
      const knownPrefixes = collectOperatorPrefixes([
        ...busRows.map((b) => b.id),
        ...lineaRows.map((l) => l.id),
      ]);
      const lineaCheck = validateOptionalLineaLabel(
        fields.lineaLabel ?? "",
        lineaRows.map((l) => l.id),
        knownPrefixes,
      );
      if (!lineaCheck.ok) {
        return NextResponse.json({ message: lineaCheck.message }, { status: 400 });
      }
      data.lineaLabel = lineaCheck.normalized;
      trackedKeys.push("lineaLabel");
    }
    if (fields.servicioLabel !== undefined) {
      data.servicioLabel = fields.servicioLabel;
      trackedKeys.push("servicioLabel");
    }
    if (fields.conductorLabel !== undefined) {
      data.conductorLabel = fields.conductorLabel;
      trackedKeys.push("conductorLabel");
    }

    if (newBusId !== undefined) {
      try {
        const resolved = await resolveBusAndAssetForTicket(
          newBusId,
          newAssetId ?? existing.assetId,
        );
        data.bus = { connect: { id: resolved.busId } };
        data.asset = { connect: { id: resolved.asset.id } };
        trackedKeys.push("busId", "assetId");
      } catch (err) {
        if (err instanceof CatalogIdFormatError) {
          return NextResponse.json({ message: err.message }, { status: 400 });
        }
        if (err instanceof Error && err.message === "ASSET_INVALID") {
          return NextResponse.json({ message: "Activo no válido para el bus indicado" }, { status: 400 });
        }
        throw err;
      }
    }

    const beforeSnapshot: Record<string, unknown> = {
      busId: existing.busId,
      assetId: existing.assetId,
      tipo: existing.tipo,
      subtipo: existing.subtipo,
      subsubtipo: existing.subsubtipo,
      dominio: existing.dominio,
      nivelImpacto: existing.nivelImpacto,
      origenTecnico: existing.origenTecnico,
      observaciones: existing.observaciones,
      title: existing.title,
      description: existing.description,
      lineaLabel: existing.lineaLabel,
      servicioLabel: existing.servicioLabel,
      conductorLabel: existing.conductorLabel,
    };

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data,
      include: {
        bus: true,
        asset: true,
        assignedTo: { select: { id: true, name: true } },
      },
    });

    const afterSnapshot: Record<string, unknown> = {
      busId: updated.busId,
      assetId: updated.assetId,
      tipo: updated.tipo,
      subtipo: updated.subtipo,
      subsubtipo: updated.subsubtipo,
      dominio: updated.dominio,
      nivelImpacto: updated.nivelImpacto,
      origenTecnico: updated.origenTecnico,
      observaciones: updated.observaciones,
      title: updated.title,
      description: updated.description,
      lineaLabel: updated.lineaLabel,
      servicioLabel: updated.servicioLabel,
      conductorLabel: updated.conductorLabel,
    };

    const changeSummary = summarizeTicketFieldChanges(beforeSnapshot, afterSnapshot, trackedKeys);
    const auditDetail = changeSummary
      ? `Corrección por ${actor.displayName}. ${changeSummary}. Motivo: ${reason}`
      : `Corrección por ${actor.displayName}. Motivo: ${reason}`;

    await prisma.ticketComment.create({
      data: {
        ticketId: updated.id,
        author: actor.displayName,
        body: `Datos del ticket corregidos. Motivo: ${reason}${changeSummary ? `\n\nCambios: ${changeSummary}` : ""}`,
      },
    });

    await writeAuditEvent({
      userId: actor.userId,
      ticketId: updated.id,
      action: "ticket.updated",
      detail: auditDetail,
    });

    publishTicketEvent("ticket_updated", {
      id: updated.id,
      busId: updated.busId,
      status: updated.status,
      priority: updated.priority,
      title: updated.title,
      assignedToUserId: updated.assignedToUserId,
      by: actor.displayName,
    });

    return NextResponse.json({
      ok: true,
      ticket: {
        id: updated.id,
        busId: updated.busId,
        assetId: updated.assetId,
        assetType: updated.asset.type,
        tipo: updated.tipo,
        subtipo: updated.subtipo,
        subsubtipo: updated.subsubtipo,
        dominio: updated.dominio,
        nivelImpacto: updated.nivelImpacto,
        origenTecnico: updated.origenTecnico,
        observaciones: updated.observaciones,
        operator: updated.bus.operator,
        municipio: updated.mapPlaceMunicipio?.trim() || updated.bus.municipio,
        lineaLabel: updated.lineaLabel ?? null,
        servicioLabel: updated.servicioLabel ?? null,
        conductorLabel: updated.conductorLabel ?? null,
        title: updated.title,
        description: updated.description,
        status: updated.status,
        priority: updated.priority,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error updating ticket:", error);
    return NextResponse.json({ message: "No se pudo actualizar el ticket" }, { status: 500 });
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
    if (!canSoftDeleteTicket(actor.role)) {
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

    await deleteTicketWithAudit({
      ticketId,
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      reason: parsed.data.reason,
    });

    return NextResponse.json({ ok: true, deletedId: ticketId });
  } catch (error) {
    console.error("Error deleting ticket:", error);
    return NextResponse.json({ message: "No se pudo eliminar el ticket" }, { status: 500 });
  }
}
