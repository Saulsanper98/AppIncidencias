import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import type { TicketPriority, TicketStatus } from "@/lib/domain";
import { buildMapTicketFeatures, GRAN_CANARIA_BOUNDS, GRAN_CANARIA_CENTER } from "@/lib/gran-canaria-map-geo";
import { prisma } from "@/lib/prisma";
import {
  normalizeTicketPriorityFilter,
  normalizeTicketScopeFilter,
  normalizeTicketStatusFilter,
  ticketStatusWhereForFilters,
} from "@/lib/ticket-filters";

function isMissingMapPlaceMunicipioColumn(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const col = error.meta?.column;
    const s = typeof col === "string" ? col : JSON.stringify(col ?? "");
    return /mapPlaceMunicipio/i.test(s);
  }
  const msg = error instanceof Error ? error.message : String(error);
  return /mapPlaceMunicipio/i.test(msg) && /no such column|does not exist|Unknown column/i.test(msg);
}

function parseIsoDate(value: string | null): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  try {
    await ensureCatalogSeeded();
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Sesion requerida" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const scope = normalizeTicketScopeFilter(searchParams.get("scope"));
    const status = normalizeTicketStatusFilter(searchParams.get("status"), { includeBorrador: true });
    const priority = normalizeTicketPriorityFilter(searchParams.get("priority"));
    const operator = searchParams.get("operator");
    const busId = searchParams.get("busId");
    const partCodeRaw = searchParams.get("partCode")?.trim() ?? "";
    const urgent = searchParams.get("urgent") === "1";
    const createdAfter = parseIsoDate(searchParams.get("createdAfter"));
    const createdBefore = parseIsoDate(searchParams.get("createdBefore"));

    let partTicketIds: string[] | null = null;
    if (partCodeRaw) {
      const part = await prisma.sparePart.findUnique({
        where: { code: partCodeRaw },
        select: { id: true },
      });
      if (!part) {
        partTicketIds = [];
      } else {
        const reservations = await prisma.ticketPartReservation.findMany({
          where: {
            sparePartId: part.id,
            status: { in: ["reservado", "consumido"] },
          },
          select: { ticketId: true },
        });
        partTicketIds = [...new Set(reservations.map((r) => r.ticketId))];
      }
    }

    const now = new Date();

    const statusWhere = ticketStatusWhereForFilters(status, scope, { includeBorrador: true });

    const limitRaw = Number.parseInt(searchParams.get("limit") ?? "2000", 10);
    const limit = Math.min(5000, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 2000));

    const west = Number.parseFloat(searchParams.get("west") ?? "");
    const south = Number.parseFloat(searchParams.get("south") ?? "");
    const east = Number.parseFloat(searchParams.get("east") ?? "");
    const north = Number.parseFloat(searchParams.get("north") ?? "");
    const hasBbox =
      [west, south, east, north].every((n) => Number.isFinite(n)) && west < east && south < north;

    const where = {
      status: statusWhere,
      priority: priority === "todos" ? undefined : priority,
      busId: busId && busId !== "todas" ? busId : undefined,
      bus: operator && operator !== "todas" ? { operator } : undefined,
      ...(partTicketIds !== null
        ? partTicketIds.length > 0
          ? { id: { in: partTicketIds } }
          : { id: { in: [] as string[] } }
        : {}),
      ...(urgent ? { OR: [{ priority: "alta" as const }, { slaDeadline: { lt: now } }] } : {}),
      ...(createdAfter ? { createdAt: { gte: createdAfter } } : {}),
      ...(createdBefore ? { createdAt: { lte: createdBefore } } : {}),
      ...(hasBbox
        ? {
            latitude: { gte: south, lte: north },
            longitude: { gte: west, lte: east },
          }
        : {}),
    };

    const selectBase = {
      id: true,
      title: true,
      status: true,
      priority: true,
      busId: true,
      latitude: true,
      longitude: true,
      slaDeadline: true,
      createdAt: true,
      bus: { select: { municipio: true, operator: true } },
    } as const;

    let tickets: Array<{
      id: string;
      title: string;
      status: TicketStatus;
      priority: TicketPriority;
      busId: string;
      latitude: number | null;
      longitude: number | null;
      mapPlaceMunicipio?: string | null;
      slaDeadline: Date;
      createdAt: Date;
      bus: { municipio: string; operator: string };
    }>;

    try {
      tickets = await prisma.ticket.findMany({
        where,
        select: { ...selectBase, mapPlaceMunicipio: true },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    } catch (error) {
      if (!isMissingMapPlaceMunicipioColumn(error)) throw error;
      tickets = await prisma.ticket.findMany({
        where,
        select: { ...selectBase },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    }

    const features = buildMapTicketFeatures(
      tickets.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        municipio: (t.mapPlaceMunicipio && String(t.mapPlaceMunicipio).trim()) || t.bus.municipio,
        busId: t.busId,
        operator: t.bus.operator,
        slaDeadline: t.slaDeadline.toISOString(),
        createdAt: t.createdAt.toISOString(),
        latitude: t.latitude,
        longitude: t.longitude,
      })),
    );

    return NextResponse.json({
      center: GRAN_CANARIA_CENTER,
      bounds: GRAN_CANARIA_BOUNDS,
      features,
      limit,
      truncated: features.length >= limit,
      fetchedAt: now.toISOString(),
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.error("[map/tickets]", error);
    const isDev = process.env.NODE_ENV === "development";
    const prismaSchemaHint =
      /latitude|longitude|createdAt|no such column|does not exist|Unknown column/i.test(raw) ||
      /Invalid.*invocation/i.test(raw);
    return NextResponse.json(
      {
        message: "No se pudo cargar el mapa de tickets",
        hint: prismaSchemaHint
          ? "Revisa que la base de datos tenga las migraciones aplicadas (campos del ticket y del mapa)."
          : undefined,
        ...(isDev ? { detail: raw.slice(0, 500) } : {}),
      },
      { status: 500 },
    );
  }
}
