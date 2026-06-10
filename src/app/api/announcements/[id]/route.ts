/**
 * CRUD por id de un anuncio concreto.
 *
 *   GET    /api/announcements/[id]   → cualquier autenticado (lee, marca leído NO se toca)
 *   PATCH  /api/announcements/[id]   → solo gestor (publica, archiva, edita)
 *   DELETE /api/announcements/[id]   → solo gestor (hard delete)
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { serializeAnnouncement } from "@/lib/announcements";
import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canPublishAnnouncements } from "@/lib/rbac";
import { sseBus } from "@/lib/sse-bus";

/**
 * Limites alineados con POST /api/announcements (route.ts):
 *   - title  max 280 (borradores autogenerados pueden ser largos)
 *   - bodyMd max 32 000 (changelog desde git con muchos commits)
 *   - expiresAt acepta "", null y ISO datetime (input limpiado)
 */
const patchSchema = z.object({
  kind: z.enum(["novedad", "aviso"]).optional(),
  title: z
    .string()
    .trim()
    .min(3, "El título debe tener al menos 3 caracteres.")
    .max(280, "El título no puede pasar de 280 caracteres.")
    .optional(),
  bodyMd: z
    .string()
    .trim()
    .max(32000, "El cuerpo del aviso no puede pasar de 32 000 caracteres.")
    .optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  status: z.enum(["borrador", "publicado", "archivado"]).optional(),
  pinned: z.boolean().optional(),
  expiresAt: z
    .union([z.string().datetime({ message: "La fecha de caducidad no es válida." }), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value && value !== "" ? value : value === "" ? null : value)),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const row = await prisma.announcement.findUnique({ where: { id } });
    if (!row) {
      return NextResponse.json({ message: "No encontrado" }, { status: 404 });
    }
    const read = await prisma.announcementRead.findUnique({
      where: { userId_announcementId: { userId: actor.userId, announcementId: id } },
      select: { announcementId: true },
    });
    return NextResponse.json({
      announcement: serializeAnnouncement(row, { isRead: !!read }),
    });
  } catch (error) {
    console.error("Error reading announcement:", error);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  if (!canPublishAnnouncements(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const payload = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(payload);
    if (!parsed.success) {
      // Mensaje con campo afectado (mismo patron que POST). Util sobre
      // todo en PATCH porque las ediciones suelen acumular cambios y
      // un 400 generico no decia que campo era el problema.
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
    const previous = await prisma.announcement.findUnique({ where: { id } });
    if (!previous) {
      return NextResponse.json({ message: "No encontrado" }, { status: 404 });
    }

    const data = parsed.data;
    const nextStatus = data.status ?? previous.status;
    const becomesPublished = nextStatus === "publicado" && previous.status !== "publicado";

    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        ...(data.kind != null ? { kind: data.kind } : {}),
        ...(data.severity != null ? { severity: data.severity } : {}),
        ...(data.title != null ? { title: data.title } : {}),
        ...(data.bodyMd != null ? { bodyMd: data.bodyMd } : {}),
        ...(data.pinned != null ? { pinned: data.pinned } : {}),
        ...(data.expiresAt !== undefined
          ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }
          : {}),
        ...(data.status != null ? { status: data.status } : {}),
        publishedAt: becomesPublished
          ? new Date()
          : data.status === "borrador" || data.status === "archivado"
            ? previous.publishedAt
            : previous.publishedAt,
      },
    });

    // Si la transición fue a publicado o quedó publicado tras un cambio importante,
    // re-emitimos en SSE para que los clientes refresquen el banner si aplica.
    if (becomesPublished) {
      // Cambio de borrador a publicado equivale a un "nuevo aviso" desde el
      // punto de vista del cliente — usamos announcement_new para reutilizar
      // la lógica de toast del listener.
      sseBus.publish("announcement_new", {
        id: updated.id,
        kind: updated.kind,
        severity: updated.severity,
        title: updated.title,
        publishedAt: updated.publishedAt?.toISOString() ?? null,
      });
    } else if (updated.status === "publicado") {
      sseBus.publish("announcement_updated", {
        id: updated.id,
        kind: updated.kind,
        severity: updated.severity,
        title: updated.title,
      });
    } else {
      // Pasó a borrador o archivado → notificar borrado lógico.
      sseBus.publish("announcement_deleted", { id: updated.id });
    }

    await writeAuditEvent({
      userId: actor.userId,
      action: "announcement.updated",
      detail: `Editó ${updated.kind} "${updated.title}" (status=${updated.status}).`,
    });

    return NextResponse.json({ announcement: serializeAnnouncement(updated) });
  } catch (error) {
    console.error("Error updating announcement:", error);
    return NextResponse.json({ message: "No se pudo actualizar." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  if (!canPublishAnnouncements(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const previous = await prisma.announcement.findUnique({ where: { id } });
    if (!previous) {
      return NextResponse.json({ message: "No encontrado" }, { status: 404 });
    }
    await prisma.announcement.delete({ where: { id } });
    await writeAuditEvent({
      userId: actor.userId,
      action: "announcement.deleted",
      detail: `Eliminó ${previous.kind} "${previous.title}".`,
    });
    sseBus.publish("announcement_deleted", { id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting announcement:", error);
    return NextResponse.json({ message: "No se pudo eliminar." }, { status: 500 });
  }
}
