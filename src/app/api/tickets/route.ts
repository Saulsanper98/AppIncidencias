import { NextResponse } from "next/server";
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
import { canAssignTicket, canCreateTicket, canUpdateTicketStatus } from "@/lib/rbac";
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
import { recordTicketStatusChange } from "@/lib/ticket-status-history";
import { linkTicketDesvio, suggestDesviosForTicket } from "@/lib/ticket-desvio-links";
import { publishTicketEvent } from "@/lib/tickets-events";
import { tryAutoAssignTicket } from "@/lib/ticket-auto-assign";
import { pendingCompletionWhere } from "@/lib/tickets/pending-completion";
import { addMinutesIso, calculatePriority } from "@/lib/ticketing";
import type { NivelImpacto } from "@/lib/tipologia";
import { trackTicketResolvedTelemetry } from "@/lib/ticket-resolution-telemetry";
import { trackServerUxEvent } from "@/lib/ux-server";
import {
  CatalogIdFormatError,
  collectOperatorPrefixes,
  validateOptionalLineaLabel,
} from "@/lib/catalog-id-format";
import { resolveBusAndAssetForTicket } from "@/lib/ticket-bus-asset";
import {
  normalizeTicketPriorityFilter,
  normalizeTicketStatusFilter,
} from "@/lib/ticket-filters";

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
  // Auto-asignar al técnico que crea el ticket (sugerencia de Ibrahim 1b).
  // Solo aplica si el actor tiene permiso para ser asignado (técnico o gestor).
  // Si llega `true` y el actor es conductor, lo ignoramos en silencio.
  assignToMe: z.boolean().optional().default(false),
  // Crear ya cerrado (sugerencia de Ibrahim 1c): casos donde el técnico
  // resuelve in situ y solo quiere dejar trazabilidad. Solo válido para
  // técnicos/gestores; si llega de un conductor lo ignoramos.
  initialStatus: z.enum(["abierto", "resuelto"]).optional().default("abierto"),
  // Nota de cierre obligatoria si initialStatus === "resuelto".
  resolutionNote: z.string().trim().max(2000).optional(),
}).refine(
  (d) =>
    (d.latitude === undefined && d.longitude === undefined) ||
    (d.latitude !== undefined && d.longitude !== undefined),
  { message: "Latitud y longitud deben enviarse juntas", path: ["latitude"] },
);

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    await ensureCatalogSeeded();
    const { searchParams } = new URL(request.url);
    const status = normalizeTicketStatusFilter(searchParams.get("status"));
    const priority = normalizeTicketPriorityFilter(searchParams.get("priority"));
    const operator = searchParams.get("operator");
    const busId = searchParams.get("busId");
    const tipo = searchParams.get("tipo");
    const partCodeRaw = searchParams.get("partCode")?.trim() ?? "";
    // `mine=1` (o `assignee=me`) limita la bandeja a los tickets asignados al
    // usuario que hace la petición. Para gestores es útil para "ver lo mío",
    // y para técnicos es la vista por defecto que les abre la app.
    const mineRaw = searchParams.get("mine") ?? searchParams.get("assignee");
    const mineActive = mineRaw === "1" || mineRaw === "true" || mineRaw === "me";
    const onlyMine = mineActive && actor.userId ? actor.userId : null;
    // Conductores solo ven tickets que ellos crearon.
    const conductorScope =
      actor.role === "conductor" && actor.userId ? actor.userId : null;

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

    const where = {
      ...(status === "borrador"
        ? pendingCompletionWhere()
        : { status: status === "todos" ? undefined : status }),
      priority: priority === "todos" ? undefined : priority,
      busId: busId && busId !== "todas" ? busId : undefined,
      bus: operator && operator !== "todas" ? { operator } : undefined,
      tipo: tipo && tipo !== "todos" ? tipo : undefined,
      ...(onlyMine ? { assignedToUserId: onlyMine } : {}),
      ...(conductorScope ? { createdByUserId: conductorScope } : {}),
      ...(partTicketIds !== null
        ? partTicketIds.length > 0
          ? { id: { in: partTicketIds } }
          : { id: { equals: "__ccmgc_no_ticket_for_partcode__" } }
        : {}),
    };

    // Listado ligero: sin bodies de comentarios/adjuntos (van en GET /api/tickets/[id]).
    const pageRaw = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const pageSizeRaw = Number.parseInt(searchParams.get("pageSize") ?? "200", 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const pageSize = Math.min(500, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 200));
    const skip = (page - 1) * pageSize;

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        include: {
          bus: true,
          asset: true,
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { comments: true, attachments: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      role: actor.role,
      actorName: actor.displayName,
      page,
      pageSize,
      total,
      hasMore: skip + tickets.length < total,
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
        createdByUserId: ticket.createdByUserId ?? null,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        incidentOccurredAt: ticket.incidentOccurredAt?.toISOString() ?? null,
        needsCompletion: ticket.needsCompletion,
        commentCount: ticket._count.comments,
        attachmentCount: ticket._count.attachments,
        attachments: [],
        comments: [],
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
      assignToMe,
      initialStatus,
      resolutionNote,
    } = parsed;

    // ====== Resolver bus + activo (creando al vuelo si no existen) ======
    let resolvedLineaLabel = lineaLabel;
    if (lineaLabel) {
      const [lineaRows, busRows] = await Promise.all([
        prisma.linea.findMany({ select: { id: true } }),
        prisma.bus.findMany({ select: { id: true } }),
      ]);
      const knownPrefixes = collectOperatorPrefixes([
        ...busRows.map((b) => b.id),
        ...lineaRows.map((l) => l.id),
      ]);
      const lineaCheck = validateOptionalLineaLabel(
        lineaLabel,
        lineaRows.map((l) => l.id),
        knownPrefixes,
      );
      if (!lineaCheck.ok) {
        return NextResponse.json({ message: lineaCheck.message }, { status: 400 });
      }
      resolvedLineaLabel = lineaCheck.normalized;
    }

    let busId: string;
    let asset;
    let busWasCreated: boolean;
    try {
      const resolved = await resolveBusAndAssetForTicket(rawBusId, rawAssetId);
      busId = resolved.busId;
      asset = resolved.asset;
      busWasCreated = resolved.busWasCreated;
    } catch (err) {
      if (err instanceof CatalogIdFormatError) {
        return NextResponse.json({ message: err.message }, { status: 400 });
      }
      if (err instanceof Error && err.message === "ASSET_INVALID") {
        return NextResponse.json({ message: "Activo no valido para el bus indicado" }, { status: 400 });
      }
      throw err;
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

    // ─── Sugerencias Ibrahim ──────────────────────────────────────────────
    // 1b) Auto-asignar al técnico/gestor que crea el ticket si lo pide.
    //     Los conductores no pueden ser asignados (no resuelven tickets).
    const shouldAssignToActor = Boolean(assignToMe) && canAssignTicket(actor.role);
    // 1c) Crear ya como resuelto si el técnico/gestor lo solicita. El
    //     conductor NO puede cerrar tickets directamente (canUpdateTicketStatus).
    const shouldCreateClosed =
      initialStatus === "resuelto" && canUpdateTicketStatus(actor.role);
    const now = new Date();

    // Si nace cerrado, registramos comentario de cierre (a continuación del
    // comentario inicial si lo hay) en vez del de "creación automática".
    const commentEntries: { author: string; body: string }[] = [];
    if (comment?.trim()) {
      commentEntries.push({ author: actor.displayName, body: comment.trim() });
    } else if (!shouldCreateClosed) {
      commentEntries.push({ author: actor.displayName, body: "Ticket creado automáticamente." });
    }
    if (shouldCreateClosed) {
      const note = resolutionNote?.trim() || "Resuelto directamente al crear el ticket.";
      commentEntries.push({ author: actor.displayName, body: `[Resolución] ${note}` });
    }

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
        status: shouldCreateClosed ? "resuelto" : "abierto",
        createdByUserId: actor.userId,
        ...(shouldCreateClosed ? { resolvedAt: now } : {}),
        ...(shouldAssignToActor ? { assignedToUserId: actor.userId } : {}),
        priority,
        slaDeadline: new Date(addMinutesIso(now, slaMinutes)),
        lineaLabel: resolvedLineaLabel ?? null,
        servicioLabel: servicioLabel ?? null,
        conductorLabel: conductorLabel ?? null,
        serviceStopped,
        impactedLines,
        ...(latitude !== undefined && longitude !== undefined
          ? {
              latitude,
              longitude,
              ...(mapPlaceMunicipio?.trim() ? { mapPlaceMunicipio: mapPlaceMunicipio.trim() } : { mapPlaceMunicipio: null }),
            }
          : {}),
        comments: { create: commentEntries },
        ...(attachmentCreates ? { attachments: attachmentCreates } : {}),
      },
    });

    if (uploadedFiles.length > 0) {
      await saveTicketUploadFiles(created.id, uploadedFiles);
    }

    await recordTicketStatusChange({
      ticketId: created.id,
      fromStatus: null,
      toStatus: shouldCreateClosed ? "resuelto" : "abierto",
      changedByUserId: actor.userId,
      changedByName: actor.displayName,
      comment: shouldCreateClosed ? "Ticket creado ya resuelto" : "Ticket creado",
    });

    if (!shouldCreateClosed) {
      const desvioSuggestions = await suggestDesviosForTicket({
        busId,
        lineaLabel: resolvedLineaLabel ?? null,
      });
      if (desvioSuggestions[0]) {
        await linkTicketDesvio({
          ticketId: created.id,
          desvioId: desvioSuggestions[0].id,
          kind: "auto",
          createdByUserId: actor.userId,
        });
      }
    }

    // Reserva de repuesto solo si el ticket no nace ya resuelto: si nace
    // cerrado significa que no hay trabajo pendiente (no toca apartar pieza).
    const reservation = shouldCreateClosed
      ? null
      : await reservePartForAssetType(asset.type, created.id);
    if (reservation && !reservation.reserved) {
      await prisma.ticket.update({
        where: { id: created.id },
        data: { status: "esperando_repuesto" },
      });
    }

    const auditDetailParts: string[] = [];
    if (busWasCreated) auditDetailParts.push(`Bus '${busId}' creado al vuelo.`);
    if (shouldAssignToActor) {
      auditDetailParts.push(`Auto-asignado a ${actor.displayName}.`);
    }
    if (shouldCreateClosed) {
      auditDetailParts.push("Creado directamente como RESUELTO.");
    } else if (reservation?.reserved) {
      auditDetailParts.push(`Reserva de ${reservation.partCode}.`);
    } else {
      auditDetailParts.push("Sin stock disponible.");
    }
    await writeAuditEvent({
      userId: actor.userId,
      ticketId: created.id,
      action: "ticket.created",
      detail: auditDetailParts.join(" "),
    });

    let assignedToUserId = created.assignedToUserId;
    let assignedToUserName: string | null = shouldAssignToActor ? actor.displayName : null;
    if (!shouldCreateClosed && !shouldAssignToActor) {
      const auto = await tryAutoAssignTicket(created.id);
      if (auto.assigned) {
        assignedToUserId = auto.userId;
        assignedToUserName = auto.userName;
      }
    }

    // Métrica server-side: complementa al evento de cliente `ticket_create_complete`.
    // El de cliente mide tiempo en formulario; éste cuenta CREATEs efectivos
    // (incluye los que entran por API directa, p.ej. /api/tickets/from-email).
    void trackServerUxEvent({
      eventName: "ticket_created",
      actor: { userId: actor.userId, role: actor.role },
      request,
      path: "/tickets",
      props: {
        priority: created.priority,
        tipo: created.tipo ?? null,
        bus_created_on_fly: busWasCreated,
        created_closed: shouldCreateClosed,
        self_assigned: shouldAssignToActor,
        had_reservation: !!reservation?.reserved,
        attachments_count: uploadedFiles.length,
      },
    });

    if (shouldCreateClosed) {
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
        resolutionChannel: "create_closed",
      });
    }

    publishTicketEvent("ticket_created", {
      id: created.id,
      busId: created.busId,
      status: shouldCreateClosed
        ? "resuelto"
        : reservation?.reserved
          ? created.status
          : "esperando_repuesto",
      priority: created.priority,
      title: created.title,
      assignedToUserId,
      assignedToUserName,
      by: actor.displayName,
    });

    return NextResponse.json(
      {
        ticketId: created.id,
        createdClosed: shouldCreateClosed,
        assignedToActor: shouldAssignToActor,
        inventory: reservation == null
          ? { status: "skipped", reason: "ticket_created_closed", partCode: "N/A" }
          : reservation.reserved
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
