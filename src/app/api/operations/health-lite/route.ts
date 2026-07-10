import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { getDesviosPoller } from "@/lib/desvios/email-poller";

/** Estado ligero del poller para badges en desvíos (sin permiso admin). */
export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  return NextResponse.json({ poller: getDesviosPoller().status() });
}
