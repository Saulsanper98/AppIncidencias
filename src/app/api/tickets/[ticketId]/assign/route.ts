import { NextResponse } from "next/server";
import { z } from "zod";

import { notifyTicketExternally } from "@/lib/external-notifications";
import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canAssignTicket } from "@/lib/rbac";

const assignSchema = z.object({
  assignedToUserId: z.string().min(1).nullable(),
});

export async function PATCH(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }
    if (!canAssignTicket(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para asignar tickets" }, { status: 403 });
    }

    const { ticketId } = await context.params;
    const payload = await request.json();
    const parsed = assignSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos de asignación invalidos" }, { status: 400 });
    }

    // Técnicos solo pueden auto-asignarse o desasignarse
    if (
      actor.role === "tecnico_campo" &&
      parsed.data.assignedToUserId !== null &&
      parsed.data.assignedToUserId !== actor.userId
    ) {
      return NextResponse.json({ message: "Los técnicos solo pueden asignarse a sí mismos" }, { status: 403 });
    }

    // Solo técnicos de campo activos pueden recibir tickets; si el usuario
    // fue desactivado después de asignarse tickets anteriores no bloqueamos
    // los ya asignados, solo los nuevos.
    if (parsed.data.assignedToUserId) {
      const technician = await prisma.user.findUnique({
        where: { id: parsed.data.assignedToUserId },
        select: { id: true, role: true, isActive: true },
      });
      if (!technician || !technician.isActive || technician.role !== "tecnico_campo") {
        return NextResponse.json({ message: "Solo se puede asignar a un técnico de campo activo" }, { status: 400 });
      }
    }

    const ticket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { assignedToUserId: parsed.data.assignedToUserId },
      select: {
        id: true,
        busId: true,
        title: true,
        assignedToUserId: true,
        assignedTo: { select: { name: true } },
      },
    });

    const assignedName = ticket.assignedTo?.name ?? "nadie";
    await writeAuditEvent({
      userId: actor.userId,
      ticketId,
      action: "ticket.assigned",
      detail: `${actor.displayName} asignó ticket a ${assignedName}`,
    });

    if (parsed.data.assignedToUserId) {
      notifyTicketExternally({
        kind: "ticket_assigned",
        ticketId: ticket.id,
        title: ticket.title,
        busId: ticket.busId,
        assigneeName: ticket.assignedTo?.name ?? null,
      });
    }

    return NextResponse.json({
      assignedToUserId: ticket.assignedToUserId,
      assignedToUserName: ticket.assignedTo?.name ?? null,
    });
  } catch (error) {
    console.error("Error assigning ticket:", error);
    return NextResponse.json({ message: "No se pudo asignar el ticket" }, { status: 500 });
  }
}
