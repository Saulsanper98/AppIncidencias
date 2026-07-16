import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { getShiftHealthSnapshot } from "@/lib/operations/shift-health";

/** Salud del turno actual: SLA, handover, desvíos, express incompletos. */
export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Sesión requerida" }, { status: 401 });
  }

  try {
    const health = await getShiftHealthSnapshot();
    return NextResponse.json(health, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (error) {
    console.error("[shift-health]", error);
    return NextResponse.json({ message: "No se pudo calcular la salud del turno" }, { status: 500 });
  }
}
