/**
 * POST /api/desvios/[id]/confirmar
 *
 * PENDIENTE → ACTIVO. Emite tambien evento SSE `desvio_actualizado` para
 * que cualquier cliente con la lista abierta refresque sin recargar.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { getDesvioById, transitionDesvio } from "@/lib/desvios/repo";
import { calcularUrgencia } from "@/lib/desvios/urgencia";
import { canManageDesvios } from "@/lib/rbac";
import { sseBus } from "@/lib/sse-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
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
      { message: `Solo se pueden confirmar desvios en estado PENDIENTE (actual: ${current.estado})` },
      { status: 409 },
    );
  }

  try {
    const desvio = await transitionDesvio(id, "ACTIVO", {
      userId: actor.userId,
      displayName: actor.displayName,
    });
    await writeAuditEvent({
      userId: actor.userId,
      action: "desvio.confirmed",
      detail: `${desvio.referencia} ${desvio.via}`.slice(0, 240),
    });
    sseBus.publish("desvio_actualizado", {
      id: desvio.id,
      estado: desvio.estado,
      via: desvio.via,
      urgencia: calcularUrgencia({
        lineas_afectadas: desvio.lineas_afectadas,
        fecha_inicio: desvio.fecha_inicio,
        fecha_fin: desvio.fecha_fin,
      }),
    });
    return NextResponse.json({ desvio });
  } catch (error) {
    console.error("desvios confirmar:", error);
    return NextResponse.json({ message: "No se pudo confirmar el desvio" }, { status: 500 });
  }
}
