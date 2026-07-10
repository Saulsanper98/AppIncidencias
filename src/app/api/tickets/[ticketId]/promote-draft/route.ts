import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { CatalogIdFormatError, collectOperatorPrefixes, validateOptionalLineaLabel } from "@/lib/catalog-id-format";
import type { NivelImpacto } from "@/lib/tipologia";
import { prisma } from "@/lib/prisma";
import { canEditTicket, canEditTicketRecord } from "@/lib/rbac";
import { getSlaMinutesForPriority } from "@/lib/sla-config";
import { recordTicketStatusChange } from "@/lib/ticket-status-history";
import { resolveBusAndAssetForTicket } from "@/lib/ticket-bus-asset";
import { trackTicketResolvedTelemetry } from "@/lib/ticket-resolution-telemetry";
import { publishTicketEvent } from "@/lib/tickets-events";
import { tryAutoAssignTicket } from "@/lib/ticket-auto-assign";
import { addMinutesIso, calculatePriority } from "@/lib/ticketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const promoteSchema = z.object({
  busId: z.string().trim().min(1),
  assetId: z.string().trim().optional().default(""),
  tipo: z.string().min(1),
  subtipo: z.string().min(1),
  subsubtipo: z.string().min(1),
  dominio: z.string().min(1),
  nivelImpacto: z.enum(["Alto", "Medio", "Bajo"]),
  origenTecnico: z.string().min(1),
  observaciones: z.string().default(""),
  title: z.string().trim().min(3),
  description: z.string().trim().min(8),
  impactedLines: z.number().int().min(1).max(10).default(1),
  serviceStopped: z.boolean().default(false),
  lineaLabel: z.string().trim().max(120).nullable().optional(),
  servicioLabel: z.string().trim().max(120).nullable().optional(),
  conductorLabel: z.string().trim().max(120).nullable().optional(),
  incidentOccurredAt: z.string().trim().optional(),
  assignToMe: z.boolean().optional().default(false),
  targetStatus: z.enum(["abierto", "resuelto"]).optional().default("abierto"),
  resolutionNote: z.string().trim().max(2000).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }
    if (!canEditTicket(actor.role, actor.isReadOnly)) {
      return NextResponse.json({ message: "Sin permisos para completar el borrador" }, { status: 403 });
    }

    const { ticketId } = await context.params;
    const body = await request.json();
    const parsed = promoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Datos no válidos" },
        { status: 400 },
      );
    }

    await ensureCatalogSeeded();

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        needsCompletion: true,
        incidentOccurredAt: true,
        assignedToUserId: true,
        createdByUserId: true,
        createdAt: true,
      },
    });
    if (!ticket) {
      return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
    }
    if (!canEditTicketRecord(actor.role, actor.userId, ticket, actor.isReadOnly)) {
      return NextResponse.json({ message: "Sin permisos para completar este borrador" }, { status: 403 });
    }
    if (!ticket.needsCompletion && ticket.status !== "borrador") {
      return NextResponse.json({ message: "Este ticket ya está completo" }, { status: 409 });
    }

    const data = parsed.data;
    const lineaRows = await prisma.linea.findMany({ select: { id: true } });
    const knownPrefixes = collectOperatorPrefixes([data.busId, ...lineaRows.map((l) => l.id)]);
    const lineaCheck = validateOptionalLineaLabel(data.lineaLabel ?? "", lineaRows.map((l) => l.id), knownPrefixes);
    if (!lineaCheck.ok) {
      return NextResponse.json({ message: lineaCheck.message }, { status: 400 });
    }

    let busId: string;
    let asset;
    try {
      const resolved = await resolveBusAndAssetForTicket(data.busId, data.assetId ?? "");
      busId = resolved.busId;
      asset = resolved.asset;
    } catch (err) {
      if (err instanceof CatalogIdFormatError) {
        return NextResponse.json({ message: err.message }, { status: 400 });
      }
      throw err;
    }

    const priority = calculatePriority({
      assetType: asset.type,
      impactedLines: data.impactedLines,
      serviceStopped: data.serviceStopped,
      nivelImpacto: data.nivelImpacto as NivelImpacto,
    });
    const slaMinutes =
      asset.slaMinutes != null && asset.slaMinutes > 0
        ? asset.slaMinutes
        : await getSlaMinutesForPriority(priority);

    const now = new Date();
    const toStatus = data.targetStatus;
    const incidentAt = data.incidentOccurredAt ? new Date(data.incidentOccurredAt) : ticket.incidentOccurredAt;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          busId,
          assetId: asset.id,
          tipo: data.tipo,
          subtipo: data.subtipo,
          subsubtipo: data.subsubtipo,
          dominio: data.dominio,
          nivelImpacto: data.nivelImpacto,
          origenTecnico: data.origenTecnico,
          observaciones: data.observaciones,
          title: data.title,
          description: data.description,
          status: toStatus,
          needsCompletion: false,
          priority,
          slaDeadline: new Date(addMinutesIso(now, slaMinutes)),
          lineaLabel: lineaCheck.normalized,
          servicioLabel: data.servicioLabel?.trim() || null,
          conductorLabel: data.conductorLabel?.trim() || null,
          serviceStopped: data.serviceStopped,
          impactedLines: data.impactedLines,
          incidentOccurredAt: incidentAt && !Number.isNaN(incidentAt.getTime()) ? incidentAt : ticket.incidentOccurredAt,
          ...(data.assignToMe ? { assignedToUserId: actor.userId } : {}),
          ...(toStatus === "resuelto" ? { resolvedAt: now } : { resolvedAt: null }),
        },
      });

      await tx.ticketComment.create({
        data: {
          ticketId,
          author: actor.displayName,
          body: `[Completado] Borrador promovido a ${toStatus === "resuelto" ? "resuelto" : "abierto"}.`,
        },
      });

      if (toStatus === "resuelto" && data.resolutionNote?.trim()) {
        await tx.ticketComment.create({
          data: {
            ticketId,
            author: actor.displayName,
            body: `[Resolución] ${data.resolutionNote.trim()}`,
          },
        });
      }

      return row;
    });

    await recordTicketStatusChange({
      ticketId,
      fromStatus: ticket.status,
      toStatus,
      changedByUserId: actor.userId,
      changedByName: actor.displayName,
      comment: "Apunte express completado",
    });

    await writeAuditEvent({
      userId: actor.userId,
      ticketId,
      action: "ticket.draft_promoted",
      detail: `${busId} · ${data.title}`,
    });

    let assignedToUserId = updated.assignedToUserId;
    let assignedToUserName: string | null = null;
    if (toStatus !== "resuelto" && !data.assignToMe && !assignedToUserId) {
      const auto = await tryAutoAssignTicket(ticketId);
      if (auto.assigned) {
        assignedToUserId = auto.userId;
        assignedToUserName = auto.userName;
      }
    }

    if (toStatus === "resuelto") {
      trackTicketResolvedTelemetry({
        actor: { userId: actor.userId, role: actor.role },
        request,
        ticketId: updated.id,
        busId: updated.busId,
        fromStatus: ticket.status,
        createdAt: ticket.createdAt,
        resolvedAt: now,
        slaDeadline: updated.slaDeadline,
        priority: updated.priority,
        tipo: updated.tipo,
        assignedToUserId: updated.assignedToUserId,
        resolutionChannel: "draft_promote",
      });
    }

    publishTicketEvent("ticket_updated", {
      id: updated.id,
      busId: updated.busId,
      status: updated.status,
      priority: updated.priority,
      title: updated.title,
      assignedToUserId,
      assignedToUserName,
      by: actor.displayName,
    });
    publishTicketEvent("ticket_status_changed", {
      id: updated.id,
      busId: updated.busId,
      status: updated.status,
      priority: updated.priority,
      title: updated.title,
      by: actor.displayName,
    });

    return NextResponse.json({
      ticket: {
        id: updated.id,
        status: updated.status,
        title: updated.title,
      },
    });
  } catch (error) {
    console.error("Error promoting draft ticket:", error);
    return NextResponse.json({ message: "No se pudo completar el borrador" }, { status: 500 });
  }
}
