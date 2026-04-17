import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import type { TicketPriority, TicketStatus } from "@/lib/domain";
import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { reservePartForAssetType } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { canCreateTicket } from "@/lib/rbac";
import { saveTicketUploadFiles, TICKET_UPLOAD_MAX_BYTES, TICKET_UPLOAD_MAX_FILES } from "@/lib/ticket-uploads";
import { addMinutesIso, calculatePriority, calculateSlaMinutes } from "@/lib/ticketing";
import type { NivelImpacto } from "@/lib/tipologia";

const createTicketSchema = z.object({
  busId: z.string().min(1),
  assetId: z.string().min(1),
  tipo: z.string().min(1),
  subtipo: z.string().min(1),
  subsubtipo: z.string().min(1),
  dominio: z.string().min(1),
  nivelImpacto: z.enum(["Alto", "Medio", "Bajo"]),
  origenTecnico: z.string().min(1),
  observaciones: z.string().default(""),
  title: z.string().min(3),
  description: z.string().min(8),
  impactedLines: z.number().int().min(1).max(10),
  serviceStopped: z.boolean(),
  photoNames: z.array(z.string()).default([]),
  comment: z.string().optional(),
  latitude: z.number().finite().gte(-90).lte(90).optional(),
  longitude: z.number().finite().gte(-180).lte(180).optional(),
  mapPlaceMunicipio: z.string().trim().max(160).optional(),
}).refine(
  (d) =>
    (d.latitude === undefined && d.longitude === undefined) ||
    (d.latitude !== undefined && d.longitude !== undefined),
  { message: "Latitud y longitud deben enviarse juntas", path: ["latitude"] },
);

function normalizeStatus(value: string | null): TicketStatus | "todos" {
  if (!value || value === "todos") {
    return "todos";
  }

  if (
    value === "abierto" ||
    value === "en_proceso" ||
    value === "esperando_repuesto" ||
    value === "resuelto"
  ) {
    return value;
  }

  return "todos";
}

function normalizePriorityFilter(value: string | null): TicketPriority | "todos" {
  if (!value || value === "todos") return "todos";
  if (value === "alta" || value === "media" || value === "baja") return value;
  return "todos";
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    await ensureCatalogSeeded();
    const { searchParams } = new URL(request.url);
    const status = normalizeStatus(searchParams.get("status"));
    const priority = normalizePriorityFilter(searchParams.get("priority"));
    const operator = searchParams.get("operator");
    const busId = searchParams.get("busId");
    const partCodeRaw = searchParams.get("partCode")?.trim() ?? "";

    let partTicketIds: string[] | null = null;
    if (partCodeRaw) {
      const part = await prisma.sparePart.findUnique({
        where: { code: partCodeRaw },
        select: { id: true },
      });
      if (!part) {
        partTicketIds = [];
      } else {
        const reservations = await prisma.ticketPartReservation.findMany({
          where: {
            sparePartId: part.id,
            status: { in: ["reservado", "consumido"] },
          },
          select: { ticketId: true },
        });
        partTicketIds = [...new Set(reservations.map((r) => r.ticketId))];
      }
    }

    const tickets = await prisma.ticket.findMany({
      where: {
        status: status === "todos" ? undefined : status,
        priority: priority === "todos" ? undefined : priority,
        busId: busId && busId !== "todas" ? busId : undefined,
        bus: operator && operator !== "todas" ? { operator } : undefined,
        ...(partTicketIds !== null
          ? partTicketIds.length > 0
            ? { id: { in: partTicketIds } }
            : { id: { equals: "__ccmgc_no_ticket_for_partcode__" } }
          : {}),
      },
      include: {
        bus: true,
        asset: true,
        comments: {
          orderBy: { createdAt: "desc" },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const attachmentIds = tickets.flatMap((t) => t.attachments.map((a) => a.id));
    type AttachmentMetaRow = {
      id: string;
      mimeType: string | null;
      sizeBytes: number | null;
      diskFileName: string | null;
    };
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
      tickets: tickets.map((ticket) => ({
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
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        attachments: ticket.attachments.map((item) => {
          const meta = metaById.get(item.id);
          const diskFileName = meta?.diskFileName ?? null;
          return {
            id: item.id,
            fileName: item.fileName,
            mimeType: meta?.mimeType ?? null,
            sizeBytes: meta?.sizeBytes ?? null,
            downloadUrl: diskFileName ? `/api/tickets/attachments/${item.id}` : null,
          };
        }),
        comments: ticket.comments.map((comment) => ({
          id: comment.id,
          author: comment.author,
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
        })),
      })),
    });
  } catch (error) {
    console.error("Error loading tickets:", error);
    return NextResponse.json({ message: "No se pudo cargar la bandeja de tickets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para crear tickets" }, { status: 401 });
    }
    if (!canCreateTicket(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para crear tickets" }, { status: 403 });
    }

    await ensureCatalogSeeded();

    const contentType = request.headers.get("content-type") ?? "";
    let parsed: z.infer<typeof createTicketSchema>;
    const uploadedFiles: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const ticketField = formData.get("ticket");
      if (typeof ticketField !== "string") {
        return NextResponse.json({ message: "Falta el campo ticket (JSON)" }, { status: 400 });
      }
      const parsedForm = createTicketSchema.safeParse(JSON.parse(ticketField));
      if (!parsedForm.success) {
        return NextResponse.json(
          { message: "Datos de ticket inválidos", issues: parsedForm.error.flatten() },
          { status: 400 },
        );
      }
      parsed = parsedForm.data;
      for (const entry of formData.getAll("files")) {
        if (typeof entry === "object" && entry !== null && "arrayBuffer" in entry && "size" in entry) {
          const f = entry as File;
          if (f.size > 0) uploadedFiles.push(f);
        }
      }
      if (uploadedFiles.length > TICKET_UPLOAD_MAX_FILES) {
        return NextResponse.json({ message: `Máximo ${TICKET_UPLOAD_MAX_FILES} archivos` }, { status: 400 });
      }
      for (const f of uploadedFiles) {
        if (f.size > TICKET_UPLOAD_MAX_BYTES) {
          return NextResponse.json(
            { message: `Cada archivo debe ser como máximo ${Math.round(TICKET_UPLOAD_MAX_BYTES / (1024 * 1024))} MB` },
            { status: 400 },
          );
        }
        if (!f.type.startsWith("image/")) {
          return NextResponse.json({ message: "Solo se permiten imagenes (image/*)" }, { status: 400 });
        }
      }
    } else {
      const payload = await request.json();
      const parsedJson = createTicketSchema.safeParse(payload);
      if (!parsedJson.success) {
        return NextResponse.json(
          { message: "Datos de ticket inválidos", issues: parsedJson.error.flatten() },
          { status: 400 },
        );
      }
      parsed = parsedJson.data;
    }

    const {
      busId,
      assetId,
      tipo,
      subtipo,
      subsubtipo,
      dominio,
      nivelImpacto,
      origenTecnico,
      observaciones,
      title,
      description,
      impactedLines,
      serviceStopped,
      photoNames,
      comment,
      latitude,
      longitude,
      mapPlaceMunicipio,
    } = parsed;

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset || asset.busId !== busId) {
      return NextResponse.json({ message: "Activo no valido para el bus indicado" }, { status: 400 });
    }

    const priority = calculatePriority({
      assetType: asset.type,
      impactedLines,
      serviceStopped,
      nivelImpacto: nivelImpacto as NivelImpacto,
    });
    const slaMinutes = calculateSlaMinutes(priority);

    const attachmentCreates =
      uploadedFiles.length === 0 && photoNames.length > 0
        ? { create: photoNames.map((fileName) => ({ fileName })) }
        : undefined;

    const created = await prisma.ticket.create({
      data: {
        busId,
        assetId,
        tipo,
        subtipo,
        subsubtipo,
        dominio,
        nivelImpacto,
        origenTecnico,
        observaciones,
        title,
        description,
        status: "abierto",
        priority,
        slaDeadline: new Date(addMinutesIso(new Date(), slaMinutes)),
        ...(latitude !== undefined && longitude !== undefined
          ? {
              latitude,
              longitude,
              ...(mapPlaceMunicipio?.trim() ? { mapPlaceMunicipio: mapPlaceMunicipio.trim() } : { mapPlaceMunicipio: null }),
            }
          : {}),
        comments: {
          create: {
            author: actor.displayName,
            body: comment?.trim() ? comment : "Ticket creado automáticamente.",
          },
        },
        ...(attachmentCreates ? { attachments: attachmentCreates } : {}),
      },
    });

    if (uploadedFiles.length > 0) {
      await saveTicketUploadFiles(created.id, uploadedFiles);
    }

    const reservation = await reservePartForAssetType(asset.type, created.id);
    if (!reservation.reserved) {
      await prisma.ticket.update({
        where: { id: created.id },
        data: { status: "esperando_repuesto" },
      });
    }

    await writeAuditEvent({
      userId: actor.userId,
      ticketId: created.id,
      action: "ticket.created",
      detail: reservation.reserved
        ? `Ticket creado con reserva de ${reservation.partCode}`
        : "Ticket creado sin stock disponible",
    });

    return NextResponse.json(
      {
        ticketId: created.id,
        inventory: reservation.reserved
          ? {
              status: "reservado",
              partCode: reservation.partCode,
              partName: reservation.partName,
              warehouseName: reservation.warehouseName,
            }
          : {
              status: "sin_stock",
              reason: reservation.reason,
              partCode: "N/A",
            },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating ticket:", error);
    return NextResponse.json({ message: "No se pudo crear el ticket" }, { status: 500 });
  }
}
