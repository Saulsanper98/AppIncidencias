import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { getTicketStatusHistory } from "@/lib/ticket-status-history";

export async function GET(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  const { ticketId } = await context.params;
  const rows = await getTicketStatusHistory(ticketId);
  return NextResponse.json({
    history: rows.map((r) => ({
      id: r.id,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      changedByName: r.changedByName,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
