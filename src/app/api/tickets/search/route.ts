/**
 * Búsqueda de tickets para autocompletar (selector de "tickets relacionados").
 *
 *   GET /api/tickets/search?q=<query>&status=resuelto&excludeId=<id>&limit=10
 *
 * - `q` (opcional): texto libre. Busca en `title` (LIKE) y por sufijo del `id`
 *   (los IDs cuid son largos; típicamente el usuario solo recuerda el código
 *   corto que pinta la UI, los 8 últimos caracteres en mayúsculas).
 * - `status` (opcional): filtra por uno de los estados válidos. Si se quiere
 *   filtrar por varios, llamar varias veces (uso pensado para el caso "solo
 *   resueltos" que pidió el usuario).
 * - `excludeId` (opcional): excluye un id concreto (típicamente el ticket actual).
 * - `limit` (opcional, máx 20): número de resultados.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = new Set(["abierto", "en_proceso", "esperando_repuesto", "resuelto"]);

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const statusRaw = url.searchParams.get("status");
    const excludeId = url.searchParams.get("excludeId")?.trim() || undefined;
    const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "10", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 10;

    // Cuando el usuario teclea muy poco, devolvemos los tickets más recientes
    // (filtrados por el estado pedido) en vez de no devolver nada.
    const baseWhere: {
      status?: "abierto" | "en_proceso" | "esperando_repuesto" | "resuelto";
      id?: { not?: string };
    } = {};
    if (statusRaw && VALID_STATUSES.has(statusRaw)) {
      baseWhere.status = statusRaw as "abierto" | "en_proceso" | "esperando_repuesto" | "resuelto";
    }
    if (excludeId) {
      baseWhere.id = { not: excludeId };
    }

    const orFilters: Array<Record<string, unknown>> = [];
    if (q.length > 0) {
      // SQLite no soporta `mode: "insensitive"`, pero `contains` ya es
      // case-insensitive sobre columnas TEXT con collation por defecto.
      orFilters.push({ title: { contains: q } });
      orFilters.push({ id: { endsWith: q.toLowerCase() } });
      orFilters.push({ busId: { contains: q.toUpperCase() } });
    }

    const tickets = await prisma.ticket.findMany({
      where: orFilters.length > 0 ? { ...baseWhere, OR: orFilters } : baseWhere,
      orderBy: [{ updatedAt: "desc" }],
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        busId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        shortId: t.id.slice(-8).toUpperCase(),
        title: t.title,
        status: t.status,
        priority: t.priority,
        busId: t.busId,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error searching tickets:", error);
    return NextResponse.json({ message: "No se pudo buscar tickets" }, { status: 500 });
  }
}
