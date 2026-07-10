/**
 * Plantillas de ticket reutilizables.
 *
 * - GET → devuelve plantillas visibles para el usuario (equipo + personales).
 * - POST → crea una nueva plantilla. Técnicos y gestores pueden marcarla como
 *   compartida con el equipo (`scope: "global"`); conductores solo personales.
 *
 * Las plantillas NO crean tickets por sí solas; solo proveen valores por
 * defecto al formulario de alta (`TicketCreateForm`). De esta forma evitamos
 * "sorpresas" automáticas y mantenemos la trazabilidad del autor del ticket.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import type { TicketPriority } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { canCreateGroupTicketTemplate, canEditTicketTemplate } from "@/lib/ticket-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PRIORITIES: TicketPriority[] = ["baja", "media", "alta"];

function sanitize(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  const userId = actor.userId;

  const templates = await prisma.ticketTemplate.findMany({
    where: {
      OR: [{ scope: "global" }, { ownerId: userId }],
    },
    orderBy: [{ scope: "asc" }, { category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      scope: true,
      ownerId: true,
      title: true,
      description: true,
      tipo: true,
      subtipo: true,
      subsubtipo: true,
      priority: true,
      category: true,
      impactedLines: true,
      serviceStopped: true,
      lineaLabel: true,
      servicioLabel: true,
      commentInitial: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    templates: templates.map((t) => ({
      ...t,
      // Indicamos al cliente si puede editar/eliminar esta plantilla.
      canEdit: canEditTicketTemplate(t.scope, t.ownerId, userId, actor.role),
    })),
  });
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const name = sanitize(body.name, 80);
  if (!name) {
    return NextResponse.json({ message: "El nombre es obligatorio" }, { status: 400 });
  }

  const requestedScope =
    typeof body.scope === "string" && (body.scope === "global" || body.scope === "group")
      ? "global"
      : "personal";
  if (requestedScope === "global" && !canCreateGroupTicketTemplate(actor.role)) {
    return NextResponse.json(
      { message: "Solo el equipo operativo puede crear plantillas compartidas" },
      { status: 403 },
    );
  }

  const priorityRaw = typeof body.priority === "string" ? body.priority : null;
  const priority =
    priorityRaw && VALID_PRIORITIES.includes(priorityRaw as TicketPriority)
      ? (priorityRaw as TicketPriority)
      : null;

  // Campos extra para "ticket rápido": si la plantilla representa siempre el
  // mismo patrón ("Salto de viaje en GL-1, sin servicio detenido…") conviene
  // memorizar también las variables que afectan a la prioridad y al
  // comentario inicial.
  const impactedLinesRaw = body.impactedLines;
  const impactedLines =
    typeof impactedLinesRaw === "number" && Number.isFinite(impactedLinesRaw)
      ? Math.min(10, Math.max(1, Math.floor(impactedLinesRaw)))
      : null;
  const serviceStopped =
    typeof body.serviceStopped === "boolean" ? body.serviceStopped : null;

  const created = await prisma.ticketTemplate.create({
    data: {
      name,
      scope: requestedScope,
      ownerId: requestedScope === "personal" ? actor.userId : actor.userId,
      title: sanitize(body.title, 160),
      description: sanitize(body.description, 4000),
      tipo: sanitize(body.tipo, 80),
      subtipo: sanitize(body.subtipo, 80),
      subsubtipo: sanitize(body.subsubtipo, 80),
      priority,
      category: sanitize(body.category, 80),
      impactedLines,
      serviceStopped,
      lineaLabel: sanitize(body.lineaLabel, 120),
      servicioLabel: sanitize(body.servicioLabel, 120),
      commentInitial: sanitize(body.commentInitial, 2000),
    },
  });

  await writeAuditEvent({
    userId: actor.userId,
    action: "ticket_template.created",
    detail: `${requestedScope}:${created.id}`,
  });

  return NextResponse.json({ template: created }, { status: 201 });
}
