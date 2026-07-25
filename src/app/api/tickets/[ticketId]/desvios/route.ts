import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { linkTicketDesvio, suggestDesviosForTicket } from "@/lib/ticket-desvio-links";
import { prisma } from "@/lib/prisma";

const linkSchema = z.object({
  desvioId: z.string().min(1),
  kind: z.enum(["manual", "auto"]).optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  const { ticketId } = await context.params;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { busId: true, lineaLabel: true },
  });
  if (!ticket) {
    return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
  }

  const [links, suggestions] = await Promise.all([
    prisma.ticketDesvioLink.findMany({
      where: { ticketId },
      include: {
        desvio: {
          select: { id: true, titulo: true, referencia: true, estado: true, lineas_afectadas: true },
        },
      },
    }),
    suggestDesviosForTicket({ busId: ticket.busId, lineaLabel: ticket.lineaLabel }),
  ]);

  return NextResponse.json({ links, suggestions });
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
  const parsed = linkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
  }
  await linkTicketDesvio({
    ticketId,
    desvioId: parsed.data.desvioId,
    kind: parsed.data.kind ?? "manual",
    createdByUserId: actor.userId,
  });
  return NextResponse.json({ ok: true });
}
