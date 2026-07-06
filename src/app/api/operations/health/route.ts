import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { getDesviosPoller } from "@/lib/desvios/email-poller";
import { getScheduler } from "@/lib/scheduler";
import { canControlDesviosPoller } from "@/lib/rbac";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }

  const poller = getDesviosPoller().status();
  const scheduler = getScheduler().status();

  return NextResponse.json({
    poller,
    scheduler,
    canManagePoller: canControlDesviosPoller(actor.role),
  });
}
