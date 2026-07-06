import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { getBusOperationalContext } from "@/lib/ticket-desvio-links";

export async function GET(
  request: Request,
  context: { params: Promise<{ busId: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  const { busId } = await context.params;
  const linea = new URL(request.url).searchParams.get("linea");
  const data = await getBusOperationalContext(decodeURIComponent(busId), linea);
  return NextResponse.json(data);
}
