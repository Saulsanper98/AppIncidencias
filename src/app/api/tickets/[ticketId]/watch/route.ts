import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { isWatchingTicket, toggleTicketWatch } from "@/lib/ticket-watchers";

export async function GET(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  const { ticketId } = await context.params;
  const watching = await isWatchingTicket(ticketId, actor.userId);
  return NextResponse.json({ watching });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  const { ticketId } = await context.params;
  const watching = await toggleTicketWatch(ticketId, actor.userId);
  return NextResponse.json({ watching });
}
