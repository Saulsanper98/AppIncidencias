/**
 * Estado / control del scheduler interno.
 *
 *  - GET → devuelve el estado actual (tick, contadores, último informe, etc.).
 *  - POST { action: "run-now" } → fuerza un tick manual (útil para depurar
 *    o ejecutar el informe diario fuera de horario). Solo gestores.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { getScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  if (actor.role !== "gestor_centro_control") {
    return NextResponse.json({ message: "Solo gestores" }, { status: 403 });
  }
  return NextResponse.json({ status: getScheduler().status() });
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  if (actor.role !== "gestor_centro_control") {
    return NextResponse.json({ message: "Solo gestores" }, { status: 403 });
  }

  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    /* sin body válido */
  }

  if (body.action === "run-now") {
    await getScheduler().runOnce();
    return NextResponse.json({ status: getScheduler().status() });
  }

  return NextResponse.json({ message: "Acción no soportada" }, { status: 400 });
}
