/**
 * Endpoints de mantenimiento de una plantilla individual.
 *
 * - PATCH → renombrar / actualizar campos.
 * - DELETE → eliminar.
 *
 * Reglas:
 *   - Plantillas `personal` solo las gestiona su dueño.
 *   - Plantillas `global` solo las gestionan los `gestor_centro_control`.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import type { TicketPriority } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { canCreateGlobalTicketTemplate } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PRIORITIES: TicketPriority[] = ["baja", "media", "alta"];

function sanitize(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

type RouteParams = { params: Promise<{ templateId: string }> };

async function loadAndAuthorize(request: Request, params: RouteParams["params"]) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return { error: NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 }) };
  }
  const { templateId } = await params;
  const template = await prisma.ticketTemplate.findUnique({ where: { id: templateId } });
  if (!template) {
    return { error: NextResponse.json({ message: "Plantilla no encontrada" }, { status: 404 }) };
  }
  const allowed =
    template.scope === "global"
      ? actor.role === "gestor_centro_control"
      : template.ownerId === actor.userId;
  if (!allowed) {
    return { error: NextResponse.json({ message: "No autorizado" }, { status: 403 }) };
  }
  return { actor, template };
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const res = await loadAndAuthorize(request, params);
  if ("error" in res) return res.error;
  const { actor, template } = res;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  // Cambio de scope: solo gestor lo permite y debe ser uno de los dos valores.
  let nextScope = template.scope;
  if (typeof body.scope === "string" && (body.scope === "personal" || body.scope === "global")) {
    if (body.scope !== template.scope) {
      if (!canCreateGlobalTicketTemplate(actor.role)) {
        return NextResponse.json(
          { message: "Solo los gestores pueden cambiar el ámbito" },
          { status: 403 },
        );
      }
      nextScope = body.scope;
    }
  }

  const priorityRaw = typeof body.priority === "string" ? body.priority : undefined;
  const priority =
    priorityRaw === undefined
      ? undefined
      : priorityRaw === "" || priorityRaw === "null"
        ? null
        : VALID_PRIORITIES.includes(priorityRaw as TicketPriority)
          ? (priorityRaw as TicketPriority)
          : undefined;

  // Campos enriquecidos (sugerencia OP03): se aceptan opcionalmente; si vienen
  // `null` se borran del template, si vienen como valor válido se actualizan.
  const impactedLinesRaw = body.impactedLines;
  const impactedLines =
    impactedLinesRaw === undefined
      ? undefined
      : impactedLinesRaw === null
        ? null
        : typeof impactedLinesRaw === "number" && Number.isFinite(impactedLinesRaw)
          ? Math.min(10, Math.max(1, Math.floor(impactedLinesRaw)))
          : undefined;
  const serviceStopped =
    body.serviceStopped === undefined
      ? undefined
      : body.serviceStopped === null
        ? null
        : typeof body.serviceStopped === "boolean"
          ? body.serviceStopped
          : undefined;

  const updated = await prisma.ticketTemplate.update({
    where: { id: template.id },
    data: {
      name: body.name !== undefined ? sanitize(body.name, 80) ?? template.name : undefined,
      scope: nextScope,
      title: body.title !== undefined ? sanitize(body.title, 160) : undefined,
      description: body.description !== undefined ? sanitize(body.description, 4000) : undefined,
      tipo: body.tipo !== undefined ? sanitize(body.tipo, 80) : undefined,
      subtipo: body.subtipo !== undefined ? sanitize(body.subtipo, 80) : undefined,
      subsubtipo: body.subsubtipo !== undefined ? sanitize(body.subsubtipo, 80) : undefined,
      priority,
      category: body.category !== undefined ? sanitize(body.category, 80) : undefined,
      impactedLines,
      serviceStopped,
      lineaLabel: body.lineaLabel !== undefined ? sanitize(body.lineaLabel, 120) : undefined,
      servicioLabel: body.servicioLabel !== undefined ? sanitize(body.servicioLabel, 120) : undefined,
      commentInitial: body.commentInitial !== undefined ? sanitize(body.commentInitial, 2000) : undefined,
    },
  });

  await writeAuditEvent({
    userId: actor.userId,
    action: "ticket_template.updated",
    detail: `${updated.scope}:${updated.id}`,
  });

  return NextResponse.json({ template: updated });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const res = await loadAndAuthorize(request, params);
  if ("error" in res) return res.error;
  const { actor, template } = res;

  await prisma.ticketTemplate.delete({ where: { id: template.id } });
  await writeAuditEvent({
    userId: actor.userId,
    action: "ticket_template.deleted",
    detail: `${template.scope}:${template.id}`,
  });

  return NextResponse.json({ ok: true });
}
