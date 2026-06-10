/**
 * Endpoints de la sección Novedades / Avisos en vivo.
 *
 *   GET  /api/announcements
 *     Query:
 *       - kind:    "novedad" | "aviso" (opcional)
 *       - status:  "publicado" (default) | "todos" (solo gestor)
 *       - active:  "1" (solo publicados + no expirados, default)
 *
 *   POST /api/announcements  (solo gestor)
 *     body: { kind, title, bodyMd?, severity?, status?, pinned?, expiresAt? }
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { activeAnnouncementWhere, serializeAnnouncement } from "@/lib/announcements";
import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canPublishAnnouncements } from "@/lib/rbac";
import { sseBus } from "@/lib/sse-bus";

/**
 * Schema de creacion de anuncio.
 *
 * Notas sobre limites:
 *   - `bodyMd` 32000 chars: el changelog autogenerado desde `git log`
 *     puede ser largo cuando hay muchos commits acumulados. Antes el
 *     limite estaba en 8000 y devolvia 400 silencioso al publicar
 *     borradores generados automaticamente.
 *   - `title` 280 chars: subido desde 200 para encajar titulos largos
 *     del borrador autogenerado ("Novedades del 8 al 10 de junio + N
 *     mejoras...").
 *   - `expiresAt`: aceptamos null, undefined, "" (cadena vacia del
 *     input que limpio el usuario) y datetime ISO. Asi el input
 *     <type="datetime-local"> puede mandarse vacio sin romper.
 */
const createSchema = z.object({
  kind: z.enum(["novedad", "aviso"]),
  title: z.string().trim().min(3, "El título debe tener al menos 3 caracteres.").max(280, "El título no puede pasar de 280 caracteres."),
  bodyMd: z.string().trim().max(32000, "El cuerpo del aviso no puede pasar de 32 000 caracteres.").optional().default(""),
  severity: z.enum(["info", "warning", "critical"]).optional().default("info"),
  status: z.enum(["borrador", "publicado", "archivado"]).optional().default("publicado"),
  pinned: z.boolean().optional().default(false),
  expiresAt: z
    .union([z.string().datetime({ message: "La fecha de caducidad no es válida." }), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value && value !== "" ? value : null)),
});

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const statusParam = url.searchParams.get("status");
    const activeParam = url.searchParams.get("active");
    const isEditor = canPublishAnnouncements(actor.role);

    // Default seguro: solo publicados+vigentes. Gestor puede pedir "todos".
    let where: Record<string, unknown> = {};
    if (statusParam === "todos" && isEditor) {
      // sin filtro de status — incluye borradores y archivados
    } else if (statusParam && ["borrador", "publicado", "archivado"].includes(statusParam) && isEditor) {
      where.status = statusParam;
    } else {
      where = { ...activeAnnouncementWhere() };
    }

    if (activeParam === "1") {
      where = { ...where, ...activeAnnouncementWhere() };
    }

    if (kind === "novedad" || kind === "aviso") {
      where.kind = kind;
    }

    const rows = await prisma.announcement.findMany({
      where,
      orderBy: [
        { pinned: "desc" },
        { publishedAt: "desc" },
        { createdAt: "desc" },
      ],
      take: 100,
    });

    // Marca de "leído" por usuario (para badge y banner).
    const readRows = await prisma.announcementRead.findMany({
      where: { userId: actor.userId, announcementId: { in: rows.map((r) => r.id) } },
      select: { announcementId: true },
    });
    const readSet = new Set(readRows.map((r) => r.announcementId));

    return NextResponse.json({
      announcements: rows.map((row) => serializeAnnouncement(row, { isRead: readSet.has(row.id) })),
    });
  } catch (error) {
    console.error("Error loading announcements:", error);
    return NextResponse.json({ message: "No se pudieron cargar las novedades." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  if (!canPublishAnnouncements(actor.role)) {
    return NextResponse.json({ message: "Sin permisos para publicar avisos" }, { status: 403 });
  }

  try {
    const payload = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) {
      // Mensaje contextualizado: incluye el campo afectado (path) para que
      // el usuario sepa exactamente que corregir. Antes solo se devolvia
      // el mensaje generico de Zod ("String must contain at most X
      // character(s)") sin decir que el problema era, p.ej., el bodyMd.
      const FIELD_LABEL: Record<string, string> = {
        kind: "Tipo",
        title: "Título",
        bodyMd: "Cuerpo",
        severity: "Severidad",
        status: "Estado",
        pinned: "Fijado",
        expiresAt: "Caducidad",
      };
      const issue = parsed.error.issues[0];
      const field = issue?.path?.[0];
      const fieldLabel = typeof field === "string" ? FIELD_LABEL[field] ?? field : undefined;
      const message =
        issue?.message
          ? fieldLabel
            ? `${fieldLabel}: ${issue.message}`
            : issue.message
          : "Datos inválidos";
      return NextResponse.json({ message, field }, { status: 400 });
    }
    const data = parsed.data;

    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    const isPublished = data.status === "publicado";

    const created = await prisma.announcement.create({
      data: {
        kind: data.kind,
        severity: data.severity,
        title: data.title,
        bodyMd: data.bodyMd ?? "",
        status: data.status,
        pinned: data.pinned,
        publishedAt: isPublished ? new Date() : null,
        expiresAt,
        authorId: actor.userId,
        authorName: actor.displayName,
      },
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "announcement.created",
      detail: `Creó ${created.kind} "${created.title}" (severity=${created.severity}, status=${created.status}).`,
    });

    // Notificación en tiempo real solo si está publicado (lo que verá el resto).
    if (isPublished) {
      sseBus.publish("announcement_new", {
        id: created.id,
        kind: created.kind,
        severity: created.severity,
        title: created.title,
        publishedAt: created.publishedAt?.toISOString() ?? null,
      });
    }

    return NextResponse.json(
      { announcement: serializeAnnouncement(created, { isRead: false }) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating announcement:", error);
    return NextResponse.json({ message: "No se pudo crear el aviso." }, { status: 500 });
  }
}
