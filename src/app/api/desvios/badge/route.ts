/**
 * GET /api/desvios/badge
 *
 * Devuelve los contadores de desvios en estado PENDIENTE y ACTIVO para
 * mostrar el numero junto al item "Desvios" del sidebar. El refresco en
 * vivo lo aporta el stream SSE con los eventos `desvio_nuevo` y
 * `desvio_actualizado`; este endpoint cubre el primer paint y el regreso
 * tras refrescar la pagina.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { countActiveDesvios } from "@/lib/desvios/repo";
import { canReadDesvios } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canReadDesvios(actor.role)) {
    return NextResponse.json({ pendientes: 0, activos: 0 }, { status: 200 });
  }
  try {
    const counts = await countActiveDesvios();
    return NextResponse.json(counts);
  } catch (error) {
    console.error("desvios badge:", error);
    return NextResponse.json({ pendientes: 0, activos: 0 }, { status: 200 });
  }
}
