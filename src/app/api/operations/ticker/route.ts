import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { buildOperationalTicker } from "@/lib/operations/ticker-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Datos agregados para la franja operativa global (ticker). */
export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }

  try {
    const snapshot = await buildOperationalTicker(actor.role);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("Error en /api/operations/ticker:", error);
    return NextResponse.json({ message: "No se pudo cargar la franja operativa" }, { status: 500 });
  }
}
