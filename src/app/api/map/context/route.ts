import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { buildMapTicketFeatures, type MapTicketInput } from "@/lib/gran-canaria-map-geo";
import { prisma } from "@/lib/prisma";

/** Capas secundarias: almacenes y preventivos (posición por municipio del bus). */
export async function GET(request: Request) {
  try {
    await ensureCatalogSeeded();
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Sesion requerida" }, { status: 401 });
    }

    const warehouses = await prisma.warehouse.findMany({
      select: { id: true, name: true, municipio: true, type: true },
    });

    const warehousePoints = buildMapTicketFeatures(
      warehouses.map(
        (w, i): MapTicketInput => ({
          id: `wh-${w.id}`,
          title: w.name,
          status: "resuelto",
          priority: "baja",
          municipio: w.municipio,
          busId: `ALM-${i}`,
          operator: w.type,
          slaDeadline: new Date().toISOString(),
        }),
      ),
    ).map((f) => ({
      id: f.id,
      kind: "warehouse" as const,
      name: f.title,
      municipio: f.municipio,
      lat: f.lat,
      lng: f.lng,
      meta: f.operator,
    }));

    const preventives = await prisma.preventiveTask.findMany({
      where: { status: { in: ["pendiente", "programada"] } },
      select: {
        id: true,
        reason: true,
        status: true,
        scheduledAt: true,
        bus: { select: { id: true, municipio: true, operator: true } },
      },
      take: 80,
      orderBy: { updatedAt: "desc" },
    });

    const preventivePoints = preventives.map((p) => {
      const [f] = buildMapTicketFeatures([
        {
          id: `pt-${p.id}`,
          title: p.reason.length > 90 ? `${p.reason.slice(0, 87)}…` : p.reason,
          status: "en_proceso",
          priority: "media",
          municipio: p.bus.municipio,
          busId: p.bus.id,
          operator: p.bus.operator,
          slaDeadline: (p.scheduledAt ?? new Date()).toISOString(),
        },
      ]);
      return {
        id: f.id,
        kind: "preventive" as const,
        name: p.reason,
        municipio: f.municipio,
        busId: f.busId,
        lat: f.lat,
        lng: f.lng,
        status: p.status,
      };
    });

    return NextResponse.json({
      warehouses: warehousePoints,
      preventives: preventivePoints,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.error("[map/context]", error);
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        message: "No se pudo cargar capas de contexto",
        ...(isDev ? { detail: raw.slice(0, 500) } : {}),
      },
      { status: 500 },
    );
  }
}
