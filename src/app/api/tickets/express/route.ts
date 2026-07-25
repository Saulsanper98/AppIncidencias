import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { CatalogIdFormatError } from "@/lib/catalog-id-format";
import { prisma } from "@/lib/prisma";
import { canCreateTicket, canUpdateTicketStatus } from "@/lib/rbac";
import { getSlaMinutesForPriority } from "@/lib/sla-config";
import { recordTicketStatusChange } from "@/lib/ticket-status-history";
import { resolveBusAndAssetForTicket } from "@/lib/ticket-bus-asset";
import {
  buildExpressTicketFields,
  parseIncidentOccurredAt,
  type ExpressTicketMode,
  type ExpressTipologiaFields,
} from "@/lib/tickets/express-ticket";
import { getTipologias } from "@/lib/tipologia-store";
import { tipologiaKey } from "@/lib/tipologia";
import { trackTicketResolvedTelemetry } from "@/lib/ticket-resolution-telemetry";
import { publishTicketEvent } from "@/lib/tickets-events";
import { addMinutesIso } from "@/lib/ticketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const expressTipologiaSchema = z.object({
  tipo: z.string().trim().min(1),
  subtipo: z.string().trim().min(1),
  subsubtipo: z.string().trim().min(1),
  dominio: z.string().trim().min(1),
  nivelImpacto: z.enum(["Alto", "Medio", "Bajo"]),
  origenTecnico: z.string().trim().min(1),
  observaciones: z.string(),
});

const expressSchema = z.object({
  busId: z.string().trim().min(1),
  note: z.string().trim().min(1, "Escribe un apunte").max(4000),
  incidentOccurredAt: z.string().trim().min(1, "Indica la hora de la incidencia"),
  mode: z.enum(["borrador", "resuelto"]),
  tipologia: expressTipologiaSchema.optional(),
});

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }
    if (!canCreateTicket(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para crear tickets" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = expressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Datos no válidos" },
        { status: 400 },
      );
    }

    const { busId: rawBusId, note, incidentOccurredAt: incidentRaw, mode, tipologia: tipologiaRaw } = parsed.data;

    if (mode === "resuelto" && !canUpdateTicketStatus(actor.role, actor.isReadOnly)) {
      return NextResponse.json({ message: "No puedes cerrar tickets con este rol" }, { status: 403 });
    }

    const incidentAt = parseIncidentOccurredAt(incidentRaw);
    if (!incidentAt) {
      return NextResponse.json({ message: "Hora de incidencia no válida" }, { status: 400 });
    }

    await ensureCatalogSeeded();

    let busId: string;
    let asset;
    try {
      const resolved = await resolveBusAndAssetForTicket(rawBusId, "");
      busId = resolved.busId;
      asset = resolved.asset;
    } catch (err) {
      if (err instanceof CatalogIdFormatError) {
        return NextResponse.json({ message: err.message }, { status: 400 });
      }
      throw err;
    }

    let tipologiaOverride: ExpressTipologiaFields | null = null;
    if (tipologiaRaw) {
      const catalog = await getTipologias();
      const match = catalog.find((item) => tipologiaKey(item) === tipologiaKey(tipologiaRaw));
      if (!match) {
        return NextResponse.json({ message: "La tipología indicada no es válida." }, { status: 400 });
      }
      tipologiaOverride = {
        tipo: match.tipo,
        subtipo: match.subtipo,
        subsubtipo: match.subsubtipo,
        dominio: match.dominio,
        nivelImpacto: match.nivelImpacto,
        origenTecnico: match.origenTecnico,
        observaciones: match.observaciones,
      };
    }

    const fields = buildExpressTicketFields(note, tipologiaOverride);
    const slaMinutes =
      asset.slaMinutes != null && asset.slaMinutes > 0
        ? asset.slaMinutes
        : await getSlaMinutesForPriority(fields.priority);

    const now = new Date();
    const asResolved = mode === "resuelto";
    const comments: { author: string; body: string }[] = [
      {
        author: actor.displayName,
        body: asResolved
          ? `[Apunte express] ${note.trim()}`
          : `[Borrador] Apunte pendiente de completar: ${note.trim()}`,
      },
    ];
    if (asResolved) {
      comments.push({
        author: actor.displayName,
        body: "[Resolución] Cerrado desde apunte express.",
      });
    }

    const created = await prisma.ticket.create({
      data: {
        busId,
        assetId: asset.id,
        tipo: fields.tipo,
        subtipo: fields.subtipo,
        subsubtipo: fields.subsubtipo,
        dominio: fields.dominio,
        nivelImpacto: fields.nivelImpacto,
        origenTecnico: fields.origenTecnico,
        observaciones: fields.observaciones,
        title: fields.title,
        description: fields.description,
        status: asResolved ? "resuelto" : "borrador",
        priority: fields.priority,
        slaDeadline: new Date(addMinutesIso(now, slaMinutes)),
        incidentOccurredAt: incidentAt,
        needsCompletion: true,
        createdByUserId: actor.userId,
        ...(asResolved ? { resolvedAt: now } : {}),
        comments: { create: comments },
      },
      include: { bus: true, asset: true },
    });

    await recordTicketStatusChange({
      ticketId: created.id,
      fromStatus: null,
      toStatus: created.status,
      changedByUserId: actor.userId,
      changedByName: actor.displayName,
      comment: asResolved ? "Alta express (resuelto)" : "Apunte express (borrador)",
    });

    await writeAuditEvent({
      userId: actor.userId,
      ticketId: created.id,
      action: asResolved ? "ticket.express_resolved" : "ticket.express_draft",
      detail: `${busId} · ${fields.title}`,
    });

    if (asResolved) {
      trackTicketResolvedTelemetry({
        actor: { userId: actor.userId, role: actor.role },
        request,
        ticketId: created.id,
        busId: created.busId,
        fromStatus: null,
        createdAt: created.createdAt,
        resolvedAt: now,
        slaDeadline: created.slaDeadline,
        priority: created.priority,
        tipo: created.tipo,
        assignedToUserId: created.assignedToUserId,
        resolutionChannel: "express",
      });
    }

    publishTicketEvent("ticket_created", {
      id: created.id,
      busId: created.busId,
      status: created.status,
      priority: created.priority,
      title: created.title,
      by: actor.displayName,
    });

    return NextResponse.json({
      ticket: {
        id: created.id,
        busId: created.busId,
        title: created.title,
        status: created.status,
        incidentOccurredAt: created.incidentOccurredAt?.toISOString() ?? null,
        createdAt: created.createdAt.toISOString(),
      },
      mode: mode as ExpressTicketMode,
    });
  } catch (error) {
    console.error("Error creating express ticket:", error);
    return NextResponse.json({ message: "No se pudo registrar el apunte" }, { status: 500 });
  }
}
