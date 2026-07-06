import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import {
  incidentDocxDownloadName,
  renderIncidentDocx,
  type IncidentDocxTicket,
} from "@/lib/tickets/incident-docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }

    await ensureCatalogSeeded();
    const { ticketId } = await context.params;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        bus: true,
        createdBy: { select: { name: true } },
        comments: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!ticket) {
      return NextResponse.json({ message: "Ticket no encontrado" }, { status: 404 });
    }

    const payload: IncidentDocxTicket = {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      busId: ticket.busId,
      tipo: ticket.tipo,
      subtipo: ticket.subtipo,
      subsubtipo: ticket.subsubtipo,
      observaciones: ticket.observaciones,
      lineaLabel: ticket.lineaLabel,
      servicioLabel: ticket.servicioLabel,
      conductorLabel: ticket.conductorLabel,
      createdAt: ticket.createdAt,
      bus: ticket.bus,
      createdBy: ticket.createdBy,
      comments: ticket.comments,
    };

    const buffer = await renderIncidentDocx(payload);
    const fileName = incidentDocxDownloadName(ticket.id);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating incident docx:", error);
    return NextResponse.json({ message: "No se pudo generar el documento" }, { status: 500 });
  }
}
