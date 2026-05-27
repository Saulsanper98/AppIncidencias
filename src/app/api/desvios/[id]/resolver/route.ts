/**
 * POST /api/desvios/[id]/resolver
 *
 * ACTIVO → RESUELTO. Solo permitido cuando el desvio esta ACTIVO.
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
  if (current.estado !== "ACTIVO") {
    return NextResponse.json(
      { message: `Solo se pueden resolver desvios en estado ACTIVO (actual: ${current.estado})` },
      { status: 409 },
    );
  }

  try {
    const desvio = await transitionDesvio(id, "RESUELTO", {
      userId: actor.userId,
      displayName: actor.displayName,
    });
    await writeAuditEvent({
      userId: actor.userId,
      action: "desvio.resolved",
      detail: `${desvio.referencia} ${desvio.via}`.slice(0, 240),
    });
    sseBus.publish("desvio_actualizado", { id: desvio.id, estado: desvio.estado, via: desvio.via });
    return NextResponse.json({ desvio });
  } catch (error) {
    console.error("desvios resolver:", error);
    return NextResponse.json({ message: "No se pudo resolver el desvio" }, { status: 500 });
  }
}
