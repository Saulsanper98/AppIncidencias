/**
 * POST /api/desvios/poller/start
 *
 * Arranca (o re-arranca con la nueva config de .env) el poller de correo y
 * devuelve su estado actual. Tambien sirve para que cualquier operador con
 * permisos pueda forzar un primer tick tras corregir credenciales en .env.
 *
 * GET /api/desvios/poller/start  → devuelve solo el estado (no arranca nada).
 *
 * RBAC: solo gestor_centro_control, porque arrancar el poller con un buzon
 * mal configurado puede acabar marcando correos como leidos.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { getDesviosPoller } from "@/lib/desvios/email-poller";
import { canControlDesviosPoller } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canControlDesviosPoller(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const status = getDesviosPoller().status();
  return NextResponse.json({ status });
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canControlDesviosPoller(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  try {
    const status = await getDesviosPoller().start();
    await writeAuditEvent({
      userId: actor.userId,
      action: "desvio.poller_started",
      detail: `provider=${status.provider} interval=${status.intervalSeconds}s sender=${status.sender}`.slice(0, 240),
    });
    return NextResponse.json({ status });
  } catch (error) {
    console.error("desvios poller start:", error);
    return NextResponse.json(
      { message: "No se pudo arrancar el poller" },
      { status: 500 },
    );
  }
}
