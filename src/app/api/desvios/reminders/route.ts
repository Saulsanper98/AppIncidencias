/**
 * GET /api/desvios/reminders
 *
 * Devuelve los desvios que deben mostrar popup de aviso ahora y cuando
 * entrara el siguiente en la ventana de 10 minutos.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { getDesvioRemindersSnapshot } from "@/lib/desvios/repo";
import { canManageDesvios } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
  }
  if (!canManageDesvios(actor.role)) {
    return NextResponse.json({ due: [], nextWakeAt: null }, { status: 200 });
  }

  try {
    const snapshot = await getDesvioRemindersSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("desvios reminders:", error);
    return NextResponse.json({ message: "No se pudieron cargar los avisos" }, { status: 500 });
  }
}
