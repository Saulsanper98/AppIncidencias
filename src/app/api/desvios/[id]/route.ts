/**
 * GET    /api/desvios/[id]   → detalle (todos los roles).
 * PATCH  /api/desvios/[id]   → editar campos (solo PENDIENTE, manager+).
 * DELETE /api/desvios/[id]   → eliminar (solo gestor).
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import {
  deleteDesvio,
  getDesvioById,
  patchDesvio,
  type DesvioPatch,
} from "@/lib/desvios/repo";
import { canDeleteDesvio, canManageDesvios, canReadDesvios } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paradaSchema = z.object({
  nombre: z.string().min(1).max(120),
  codigo: z.string().min(1).max(20),
});

const patchSchema = z
  .object({
    via: z.string().min(2).max(160).optional(),
    tramo: z.string().min(2).max(400).optional(),
    motivo: z.string().min(2).max(400).optional(),
    fecha_inicio: z.coerce.date().optional(),
    fecha_fin: z.coerce.date().optional(),
    hora_fin_estimada: z.boolean().optional(),
    sin_fecha_fin: z.boolean().optional(),
    sentido: z.enum(["IDA", "VUELTA", "AMBOS"]).optional(),
    lineas_afectadas: z.array(z.string().min(1).max(20)).max(40).optional(),
    paradas_fuera: z.array(paradaSchema).max(60).optional(),
    paradas_alternativas: z.array(paradaSchema).max(60).optional(),
    notas: z.string().max(2000).nullable().optional(),
    url_itinerario: z
      .string()
      .max(500)
      .nullable()
      .optional()
      .refine((v) => !v || /^https?:\/\//i.test(v.trim()), {
        message: "URL debe empezar por http o https",
      }),
  })
  .refine(
    (d) =>
      d.sin_fecha_fin ||
      !d.fecha_inicio ||
      !d.fecha_fin ||
      d.fecha_fin.getTime() > d.fecha_inicio.getTime(),
    { message: "fecha_fin debe ser posterior a fecha_inicio", path: ["fecha_fin"] },
  );

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
  }
  if (!canReadDesvios(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const desvio = await getDesvioById(id);
  if (!desvio) {
    return NextResponse.json({ message: "Desvio no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ desvio });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
  }
  if (!canManageDesvios(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const current = await getDesvioById(id);
  if (!current) {
    return NextResponse.json({ message: "Desvio no encontrado" }, { status: 404 });
  }
  if (current.estado !== "PENDIENTE") {
    return NextResponse.json(
      { message: "Solo se pueden editar desvios en estado PENDIENTE" },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON invalido" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Datos invalidos", errors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const patch: DesvioPatch = parsed.data;
    const desvio = await patchDesvio(id, patch);
    await writeAuditEvent({
      userId: actor.userId,
      action: "desvio.updated",
      detail: `Edicion ${desvio.referencia}`.slice(0, 240),
    });
    return NextResponse.json({ desvio });
  } catch (error) {
    console.error("desvios patch:", error);
    return NextResponse.json({ message: "No se pudo actualizar el desvio" }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
  }
  if (!canDeleteDesvio(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const existing = await getDesvioById(id);
  if (!existing) {
    return NextResponse.json({ message: "Desvio no encontrado" }, { status: 404 });
  }
  try {
    await deleteDesvio(id);
    await writeAuditEvent({
      userId: actor.userId,
      action: "desvio.deleted",
      detail: `Eliminacion ${existing.referencia} ${existing.via}`.slice(0, 240),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("desvios delete:", error);
    return NextResponse.json({ message: "No se pudo eliminar el desvio" }, { status: 500 });
  }
}
