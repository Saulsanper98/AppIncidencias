/**
 * POST /api/desvios/[id]/reactivar
 *
 * Re-activa un desvio que estaba en RESUELTO. Solo aplica a los desvios
 * marcados como `sin_fecha_fin = true` (los "indefinidos"), donde el ciclo
 * activar/desactivar/reactivar es deliberado: la misma incidencia recurrente
 * (manifestaciones semanales, mercados, paseos) se enciende y se apaga sin
 * tener que crear un registro nuevo cada vez.
 *
 * El registro de cada ciclo queda en `AuditEvent` con la accion
 * `desvio.reactivated` para poder reconstruir el historico.
 *
 * Emite tambien evento SSE `desvio_actualizado` para que cualquier cliente
 * con la lista o el detalle abiertos refresque sin recargar.
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
  if (!current.sin_fecha_fin) {
    return NextResponse.json(
      {
        message:
          "Solo se pueden reactivar desvios indefinidos. Crea uno nuevo si era programado.",
      },
      { status: 409 },
    );
  }
  if (current.estado !== "RESUELTO") {
    return NextResponse.json(
      {
        message: `Solo se pueden reactivar desvios resueltos (actual: ${current.estado})`,
      },
      { status: 409 },
    );
  }

  try {
    // Transition a ACTIVO (no PENDIENTE) para que el operador pueda usar
    // un desvio recurrente sin tener que pasar otra vez por "Confirmar".
    // `transitionDesvio` actualiza confirmado_por/confirmado_en cuando el
    // destino es ACTIVO, de modo que la Vista rapida y el Timeline siempre
    // reflejan el ultimo ciclo de activacion.
    const desvio = await transitionDesvio(id, "ACTIVO", {
      userId: actor.userId,
      displayName: actor.displayName,
    });
    await writeAuditEvent({
      userId: actor.userId,
      action: "desvio.reactivated",
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
    console.error("desvios reactivar:", error);
    return NextResponse.json(
      { message: "No se pudo reactivar el desvio" },
      { status: 500 },
    );
  }
}
