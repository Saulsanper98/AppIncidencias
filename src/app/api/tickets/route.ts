import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

// El handler maneja subidas multipart con vídeos (hasta 120 MB combinados),
// por lo que se fuerza el runtime Node (Edge tendría límite de body de 4 MB)
// y se marca como dinámico para evitar cualquier intento de prerender.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import type { TicketPriority, TicketStatus } from "@/lib/domain";
import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { reservePartForAssetType } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { canCreateTicket } from "@/lib/rbac";
import {
  TICKET_UPLOAD_MAX_FILES,
  TICKET_UPLOAD_MAX_IMAGE_BYTES,
  TICKET_UPLOAD_MAX_TOTAL_BYTES,
  TICKET_UPLOAD_MAX_VIDEO_BYTES,
  classifyTicketUploadFile,
  saveTicketUploadFiles,
  ticketUploadByteLimit,
} from "@/lib/ticket-uploads";
import { getSlaMinutesForPriority } from "@/lib/sla-config";
import { publishTicketEvent } from "@/lib/tickets-events";
import { addMinutesIso, calculatePriority } from "@/lib/ticketing";
import type { NivelImpacto } from "@/lib/tipologia";

const createTicketSchema = z.object({
  // El usuario puede teclear un bus que no esté en el catálogo: lo crearemos al
  // vuelo con valores por defecto. Por eso la validación es laxa (longitud
  // mínima 1) y dejamos al backend la decisión de crear o no.
  busId: z.string().trim().min(1),
  // Si el bus es nuevo, el assetId puede venir vacío y el backend usa
  // `${busId}-SAE-DEFAULT`.
  assetId: z.string().trim().optional().default(""),
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
  // Etiquetas libres opcionales (sugerencia de Pedro). Si llegan vacías o sólo
  // espacios se convierten a null.
  lineaLabel: z
    .string()
    .trim()
    .max(120)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  servicioLabel: z
    .string()
    .trim()
    .max(120)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  conductorLabel: z
    .string()
    .trim()
    .max(120)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
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
    // `mine=1` (o `assignee=me`) limita la bandeja a los tickets asignados al
    // usuario que hace la petición. Para gestores es útil para "ver lo mío",
    // y para técnicos es la vista por defecto que les abre la app.
    const mineRaw = searchParams.get("mine") ?? searchParams.get("assignee");
    const mineActive = mineRaw === "1" || mineRaw === "true" || mineRaw === "me";
    const onlyMine = mineActive && actor.userId ? actor.userId : null;

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
        ...(onlyMine ? { assignedToUserId: onlyMine } : {}),
        ...(partTicketIds !== null
          ? partTicketIds.length > 0
            ? { id: { in: partTicketIds } }
            : { id: { equals: "__ccmgc_no_ticket_for_partcode__" } }
          : {}),
      },
      include: {
        bus: true,
        asset: true,
        assignedTo: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: "desc" },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Los metadatos de adjunto (mimeType, sizeBytes) están en columnas que Prisma
    // no genera todavía en el select de include, así que tiramos de raw query.
    // Feo pero funciona hasta que migremos a un campo calculado.
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
        return NextResponse.json(
          { message: `Máximo ${TICKET_UPLOAD_MAX_FILES} archivos por ticket` },
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
          const limitMb = Math.round(limit / (1024 * 1024));
          return NextResponse.json(
            {
              message: `Cada ${kind === "video" ? "vídeo" : "imagen"} debe ser como máximo ${limitMb} MB (${f.name}).`,
              maxImageBytes: TICKET_UPLOAD_MAX_IMAGE_BYTES,
              maxVideoBytes: TICKET_UPLOAD_MAX_VIDEO_BYTES,
            },
            { status: 413 },
          );
        }
        combinedBytes += f.size;
      }
      if (combinedBytes > TICKET_UPLOAD_MAX_TOTAL_BYTES) {
        const totalMb = Math.round(TICKET_UPLOAD_MAX_TOTAL_BYTES / (1024 * 1024));
        return NextResponse.json(
          {
            message: `El tamaño total de la subida supera ${totalMb} MB. Reduce el número o el peso de los archivos.`,
            maxTotalBytes: TICKET_UPLOAD_MAX_TOTAL_BYTES,
          },
          { status: 413 },
        );
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
      busId: rawBusId,
      assetId: rawAssetId,
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
      lineaLabel,
      servicioLabel,
      conductorLabel,
    } = parsed;

    // ====== Resolver bus + activo (creando al vuelo si no existen) ======
    // El usuario puede teclear un bus que no esté en el catálogo: si no existe
    // lo creamos con valores por defecto y un activo SAE-DEFAULT, para que el
    // ticket pueda persistir. El gestor del catálogo lo completará después.
    const busId = rawBusId.trim();
    const existingBus = await prisma.bus.findUnique({
      where: { id: busId },
      include: { assets: true },
    });

    let asset;
    let busWasCreated = false;
    if (!existingBus) {
      const defaultAssetId = `${busId}-SAE-DEFAULT`;
      const created = await prisma.bus.create({
        data: {
          id: busId,
          operator: "Sin asignar",
          municipio: "Sin asignar",
          lineas: "",
          assets: {
            create: [
              {
                id: defaultAssetId,
                type: "sae",
                serialNumber: `SN-${busId}-01`,
              },
            ],
          },
        },
        include: { assets: true },
      });
      busWasCreated = true;
      asset = created.assets[0];
    } else {
      const assetIdTrimmed = rawAssetId?.trim() ?? "";
      if (assetIdTrimmed) {
        const found = existingBus.assets.find((row) => row.id === assetIdTrimmed);
        if (!found) {
          return NextResponse.json(
            { message: "Activo no valido para el bus indicado" },
            { status: 400 },
          );
        }
        asset = found;
      } else {
        // Sin assetId explícito: usamos el primer activo del bus (típicamente el SAE).
        // Si el bus no tiene ningún activo (caso del catálogo recién importado),
        // creamos SAE-DEFAULT al vuelo en lugar de fallar.
        if (existingBus.assets.length === 0) {
          const defaultAssetId = `${busId}-SAE-DEFAULT`;
          asset = await prisma.asset.create({
            data: {
              id: defaultAssetId,
              busId,
              type: "sae",
              serialNumber: `SN-${busId}-01`,
            },
          });
        } else {
          asset = existingBus.assets[0];
        }
      }
    }

    const priority = calculatePriority({
      assetType: asset.type,
      impactedLines,
      serviceStopped,
      nivelImpacto: nivelImpacto as NivelImpacto,
    });
    // El SLA por prioridad ahora se lee de la tabla SlaConfig (editable desde
    // el panel de administración). El override por activo (Asset.slaMinutes)
    // sigue siendo prioritario porque suele responder a casos puntuales.
    const slaMinutes =
      asset.slaMinutes != null && asset.slaMinutes > 0
        ? asset.slaMinutes
        : await getSlaMinutesForPriority(priority);

    const attachmentCreates =
      uploadedFiles.length === 0 && photoNames.length > 0
        ? { create: photoNames.map((fileName) => ({ fileName })) }
        : undefined;

    const created = await prisma.ticket.create({
      data: {
        busId,
        assetId: asset.id,
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
        lineaLabel: lineaLabel ?? null,
        servicioLabel: servicioLabel ?? null,
        conductorLabel: conductorLabel ?? null,
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
      detail:
        (busWasCreated ? `Bus '${busId}' creado al vuelo. ` : "") +
        (reservation.reserved
          ? `Ticket creado con reserva de ${reservation.partCode}`
          : "Ticket creado sin stock disponible"),
    });

    publishTicketEvent("ticket_created", {
      id: created.id,
      busId: created.busId,
      status: reservation.reserved ? created.status : "esperando_repuesto",
      priority: created.priority,
      title: created.title,
      assignedToUserId: created.assignedToUserId,
      by: actor.displayName,
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
