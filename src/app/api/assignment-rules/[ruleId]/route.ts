import { NextResponse } from "next/server";
import { z } from "zod";

import { parseShiftInput } from "@/lib/assignment-rules";
import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";

const patchSchema = z.object({
  operator: z.string().trim().max(80).nullable().optional(),
  lineaMatch: z.string().trim().max(120).nullable().optional(),
  shift: z.string().trim().max(1).nullable().optional(),
  userId: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ ruleId: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }

  const { ruleId } = await context.params;
  const existing = await prisma.ticketAssignmentRule.findUnique({ where: { id: ruleId } });
  if (!existing) {
    return NextResponse.json({ message: "Regla no encontrada" }, { status: 404 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  if (parsed.data.shift !== undefined) {
    const shift = parseShiftInput(parsed.data.shift);
    if (parsed.data.shift && !shift) {
      return NextResponse.json({ message: "Turno inválido (usa M, T o N)" }, { status: 400 });
    }
  }

  if (parsed.data.userId) {
    const technician = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, role: true, isActive: true },
    });
    if (!technician?.isActive || technician.role !== "tecnico_campo") {
      return NextResponse.json({ message: "El técnico debe ser de campo y estar activo" }, { status: 400 });
    }
  }

  const shift =
    parsed.data.shift === undefined
      ? undefined
      : parseShiftInput(parsed.data.shift);

  const rule = await prisma.ticketAssignmentRule.update({
    where: { id: ruleId },
    data: {
      ...(parsed.data.operator !== undefined ? { operator: parsed.data.operator?.trim() || null } : {}),
      ...(parsed.data.lineaMatch !== undefined ? { lineaMatch: parsed.data.lineaMatch?.trim() || null } : {}),
      ...(parsed.data.shift !== undefined ? { shift } : {}),
      ...(parsed.data.userId !== undefined ? { userId: parsed.data.userId } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    },
    include: { user: { select: { name: true } } },
  });

  await writeAuditEvent({
    userId: actor.userId,
    action: "assignment_rule.updated",
    detail: JSON.stringify({ id: rule.id }),
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ ruleId: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }

  const { ruleId } = await context.params;
  const existing = await prisma.ticketAssignmentRule.findUnique({ where: { id: ruleId } });
  if (!existing) {
    return NextResponse.json({ message: "Regla no encontrada" }, { status: 404 });
  }

  await prisma.ticketAssignmentRule.delete({ where: { id: ruleId } });
  await writeAuditEvent({
    userId: actor.userId,
    action: "assignment_rule.deleted",
    detail: ruleId,
  });

  return NextResponse.json({ ok: true });
}
