/**
 * GET /api/tickets/drafts-badge
 *
 * Contador de tickets en estado `borrador` (apuntes express sin completar).
 * Alimenta el badge de «Bandeja» en el sidebar y el banner de recordatorio.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canEditTicket } from "@/lib/rbac";
import { pendingCompletionWhere } from "@/lib/tickets/pending-completion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canEditTicket(actor.role, actor.isReadOnly)) {
    return NextResponse.json({ count: 0 });
  }

  try {
    const count = await prisma.ticket.count({ where: pendingCompletionWhere() });
    return NextResponse.json({ count });
  } catch (error) {
    console.error("tickets drafts badge:", error);
    return NextResponse.json({ count: 0 });
  }
}
