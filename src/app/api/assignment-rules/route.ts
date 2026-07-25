import { NextResponse } from "next/server";
import { z } from "zod";

import { listAssignmentRules, parseShiftInput } from "@/lib/assignment-rules";
import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";

const postSchema = z.object({
  operator: z.string().trim().max(80).nullable().optional(),
  lineaMatch: z.string().trim().max(120).nullable().optional(),
  shift: z.string().trim().max(1).nullable().optional(),
  userId: z.string().min(1),
  sortOrder: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  if (!canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const rules = await listAssignmentRules();
  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const shift = parseShiftInput(parsed.data.shift);
  if (parsed.data.shift && !shift) {
    return NextResponse.json({ message: "Turno inválido (usa M, T o N)" }, { status: 400 });
  }

  const technician = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!technician?.isActive || technician.role !== "tecnico_campo") {
    return NextResponse.json({ message: "El técnico debe ser de campo y estar activo" }, { status: 400 });
  }

  const maxOrder = await prisma.ticketAssignmentRule.aggregate({ _max: { sortOrder: true } });
  const sortOrder = parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1;

  const rule = await prisma.ticketAssignmentRule.create({
    data: {
      operator: parsed.data.operator?.trim() || null,
      lineaMatch: parsed.data.lineaMatch?.trim() || null,
      shift,
      userId: parsed.data.userId,
      sortOrder,
      active: parsed.data.active ?? true,
    },
    include: { user: { select: { name: true } } },
  });

  await writeAuditEvent({
    userId: actor.userId,
    action: "assignment_rule.created",
    detail: JSON.stringify({ id: rule.id, userId: rule.userId }),
  });

  return NextResponse.json({
    rule: {
      id: rule.id,
      active: rule.active,
      sortOrder: rule.sortOrder,
      operator: rule.operator,
      lineaMatch: rule.lineaMatch,
      shift: rule.shift,
      userId: rule.userId,
      userName: rule.user.name,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    },
  });
}
