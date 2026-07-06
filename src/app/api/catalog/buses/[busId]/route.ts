import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { getBusAnomalyInfo } from "@/lib/bus-anomaly";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { canEditBusDetail, canReadCatalog } from "@/lib/rbac";
import { getBusOperationalContext } from "@/lib/ticket-desvio-links";

export const dynamic = "force-dynamic";

const patchBusDetailSchema = z.object({
  description: z.string().max(4000).nullable(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ busId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canReadCatalog(actor.role)) {
      return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
    }

    await ensureCatalogSeeded();
    const { busId: rawId } = await context.params;
    const busId = decodeURIComponent(rawId).trim();
    if (!busId) {
      return NextResponse.json({ message: "Bus requerido" }, { status: 400 });
    }

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      include: {
        assets: true,
        photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!bus) {
      return NextResponse.json({ message: "Bus no encontrado" }, { status: 404 });
    }

    const [anomaly, operational, tickets, ticketTotal] = await Promise.all([
      getBusAnomalyInfo(busId),
      getBusOperationalContext(busId),
      prisma.ticket.findMany({
        where: { busId },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { asset: { select: { type: true } } },
      }),
      prisma.ticket.count({ where: { busId } }),
    ]);

    const statusCounts = {
      abierto: 0,
      en_proceso: 0,
      esperando_repuesto: 0,
      resuelto: 0,
    };
    for (const t of tickets) {
      if (t.status in statusCounts) {
        statusCounts[t.status as keyof typeof statusCounts] += 1;
      }
    }

    return NextResponse.json({
      bus: {
        id: bus.id,
        operator: bus.operator,
        municipio: bus.municipio,
        lineas: bus.lineas.split(",").filter(Boolean),
        description: bus.description ?? null,
        assets: bus.assets.map((a) => ({
          id: a.id,
          type: a.type,
          serialNumber: a.serialNumber,
          slaMinutes: a.slaMinutes ?? null,
        })),
        photos: bus.photos.map((p) => ({
          id: p.id,
          url: p.url,
          caption: p.caption,
          sortOrder: p.sortOrder,
          createdAt: p.createdAt.toISOString(),
        })),
      },
      anomaly,
      operational,
      tickets: {
        total: ticketTotal,
        statusCounts,
        recent: tickets.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          tipo: t.tipo,
          assetType: t.asset.type,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Error loading bus detail:", error);
    return NextResponse.json({ message: "No se pudo cargar el detalle del bus" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ busId: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canEditBusDetail(actor.role)) {
      return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
    }

    const { busId: rawId } = await context.params;
    const busId = decodeURIComponent(rawId).trim();
    if (!busId) {
      return NextResponse.json({ message: "Bus requerido" }, { status: 400 });
    }

    const payload = await request.json();
    const parsed = patchBusDetailSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }

    const exists = await prisma.bus.findUnique({ where: { id: busId }, select: { id: true } });
    if (!exists) {
      return NextResponse.json({ message: "Bus no encontrado" }, { status: 404 });
    }

    const updated = await prisma.bus.update({
      where: { id: busId },
      data: { description: parsed.data.description },
      select: { id: true, description: true },
    });

    return NextResponse.json({ bus: updated });
  } catch (error) {
    console.error("Error updating bus detail:", error);
    return NextResponse.json({ message: "No se pudo actualizar la ficha del bus" }, { status: 500 });
  }
}
