import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canAddTicketComment } from "@/lib/rbac";

const commentSchema = z.object({
  body: z.string().trim().min(1).max(8000),
});

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }
    if (!canAddTicketComment(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para añadir notas" }, { status: 403 });
    }

    const { ticketId } = await context.params;
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
    }

    const payload = await request.json();
    const parsed = commentSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Comentario invalido" }, { status: 400 });
    }

    const created = await prisma.ticketComment.create({
      data: {
        ticketId: ticket.id,
        author: actor.displayName,
        body: parsed.data.body,
      },
    });

    await writeAuditEvent({
      userId: actor.userId,
      ticketId: ticket.id,
      action: "ticket.comment_added",
      detail: `Nota por ${actor.displayName} (${parsed.data.body.slice(0, 120)}${parsed.data.body.length > 120 ? "…" : ""})`,
    });

    return NextResponse.json({
      ok: true,
      comment: {
        id: created.id,
        author: created.author,
        body: created.body,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating ticket comment:", error);
    return NextResponse.json({ message: "No se pudo guardar la nota" }, { status: 500 });
  }
}
