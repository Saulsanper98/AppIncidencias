import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { getEscalationRules, updateEscalationRules } from "@/lib/escalation-config";
import { canManageCatalog } from "@/lib/rbac";

const putSchema = z
  .object({
    unassignedAltaMinutes: z.number().int().min(1).max(60 * 24 * 14).optional(),
    unassignedMediaMinutes: z.number().int().min(1).max(60 * 24 * 14).optional(),
    unassignedBajaMinutes: z.number().int().min(1).max(60 * 24 * 14).optional(),
    slaWarnMinutes: z.number().int().min(1).max(24 * 60).optional(),
    staleTicketHours: z.number().int().min(1).max(24 * 30).optional(),
    autoAssignEnabled: z.boolean().optional(),
    slaReassignEnabled: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "Indica al menos un valor",
  });

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  const rules = await getEscalationRules();
  return NextResponse.json({ rules });
}

export async function PUT(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const payload = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const rules = await updateEscalationRules(parsed.data, actor.displayName);
  await writeAuditEvent({
    userId: actor.userId,
    action: "escalation_config.updated",
    detail: JSON.stringify(parsed.data),
  });
  return NextResponse.json({ rules });
}
