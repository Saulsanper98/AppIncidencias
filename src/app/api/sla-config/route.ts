/**
 * Endpoints para gestionar el SLA configurable por prioridad.
 *
 *   GET  /api/sla-config  -> autenticado: devuelve {alta,media,baja} en minutos.
 *   PUT  /api/sla-config  -> gestor: actualiza los valores.
 *
 * Sustituye a los antiguos valores hardcoded (30/120/240) y permite cambiarlos
 * desde el panel de Administración → Catálogo.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { canManageCatalog } from "@/lib/rbac";
import { getSlaConfig, updateSlaConfig } from "@/lib/sla-config";

const putSchema = z
  .object({
    alta: z.number().int().min(1).max(60 * 24 * 7).optional(),
    media: z.number().int().min(1).max(60 * 24 * 7).optional(),
    baja: z.number().int().min(1).max(60 * 24 * 7).optional(),
  })
  .refine((data) => Object.values(data).some((v) => typeof v === "number"), {
    message: "Debes indicar al menos una prioridad",
  });

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  try {
    const snapshot = await getSlaConfig();
    return NextResponse.json({ sla: snapshot });
  } catch (error) {
    console.error("Error reading SLA config:", error);
    return NextResponse.json({ message: "No se pudo leer la configuración de SLA" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos para gestionar SLA" }, { status: 403 });
  }
  try {
    const payload = await request.json().catch(() => null);
    const parsed = putSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    const before = await getSlaConfig();
    const after = await updateSlaConfig(parsed.data, { name: actor.displayName });

    const changes = (["alta", "media", "baja"] as const)
      .filter((priority) => before[priority] !== after[priority])
      .map((priority) => `${priority}: ${before[priority]}→${after[priority]} min`)
      .join(", ");
    if (changes) {
      await writeAuditEvent({
        userId: actor.userId,
        action: "sla.update_config",
        detail: `SLA actualizado: ${changes}`,
      });
    }

    return NextResponse.json({ sla: after });
  } catch (error) {
    console.error("Error updating SLA config:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo actualizar el SLA" },
      { status: 500 },
    );
  }
}
