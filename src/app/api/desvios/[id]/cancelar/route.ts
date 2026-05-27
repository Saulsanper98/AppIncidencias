/**
 * POST /api/desvios/[id]/cancelar
 *
 * PENDIENTE / ACTIVO → CANCELADO. Util cuando el operador detecta una falsa
 * alarma o un duplicado. No se permite cancelar un desvio ya RESUELTO o
 * CANCELADO (deberian crear uno nuevo en su lugar).
 */

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { getDesvioById, transitionDesvio } from "@/lib/desvios/repo";
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
  if (current.estado === "RESUELTO" || current.estado === "CANCELADO") {
    return NextResponse.json(
      { message: `No se puede cancelar un desvio en estado ${current.estado}` },
      { status: 409 },
    );
  }

  try {
    const desvio = await transitionDesvio(id, "CANCELADO", {
      userId: actor.userId,
      displayName: actor.displayName,
    });
    await writeAuditEvent({
      userId: actor.userId,
      action: "desvio.cancelled",
      detail: `${desvio.referencia} ${desvio.via}`.slice(0, 240),
    });
    sseBus.publish("desvio_actualizado", { id: desvio.id, estado: desvio.estado, via: desvio.via });
    return NextResponse.json({ desvio });
  } catch (error) {
    console.error("desvios cancelar:", error);
    return NextResponse.json({ message: "No se pudo cancelar el desvio" }, { status: 500 });
  }
}
