import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: { params: Promise<{ busId: string }> },
) {
  try {
    const { busId } = await context.params;
    if (!busId) {
      return NextResponse.json({ message: "Bus requerido" }, { status: 400 });
    }

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      select: { id: true, operator: true, municipio: true },
    });
    if (!bus) {
      return NextResponse.json({ message: "Bus no encontrado" }, { status: 404 });
    }

    const tickets = await prisma.ticket.findMany({
      where: { busId },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        asset: { select: { type: true } },
      },
    });

    const total = tickets.length;
    const statusCounts = {
      abierto: tickets.filter((t) => t.status === "abierto").length,
      en_proceso: tickets.filter((t) => t.status === "en_proceso").length,
      esperando_repuesto: tickets.filter((t) => t.status === "esperando_repuesto").length,
      resuelto: tickets.filter((t) => t.status === "resuelto").length,
    };

    return NextResponse.json({
      bus,
      summary: { total, statusCounts },
      history: tickets.map((ticket) => ({
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        assetType: ticket.asset.type,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error loading bus history:", error);
    return NextResponse.json({ message: "No se pudo cargar historial del bus" }, { status: 500 });
  }
}
