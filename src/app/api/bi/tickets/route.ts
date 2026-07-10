import { NextResponse } from "next/server";

import { requirePowerBiAuth } from "@/lib/bi-auth";
import { mapTicketToBiRow } from "@/lib/bi/ticket-row";
import { parseBiDateRange, parseBiPagination } from "@/lib/bi/parse-range";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ticketInclude = {
  bus: { select: { operator: true, municipio: true } },
  asset: { select: { type: true } },
  assignedTo: { select: { name: true } },
} as const;

/**
 * GET /api/bi/tickets
 *
 * Tabla plana de incidencias para Power BI (conector Web + Bearer token).
 *
 * Query:
 *   - range=today|yesterday|last7|last30|last90|last180
 *   - from=YYYY-MM-DD&to=YYYY-MM-DD
 *   - page, pageSize (máx. 5000)
 *   - status=abierto|resuelto|...|todos (default: todos excepto borrador)
 *
 * Header: Authorization: Bearer <POWER_BI_API_KEY>
 */
export async function GET(request: Request) {
  const authError = requirePowerBiAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    let dateRange;
    try {
      dateRange = parseBiDateRange(searchParams);
    } catch (err) {
      return NextResponse.json(
        { message: err instanceof Error ? err.message : "Rango de fechas inválido" },
        { status: 400 },
      );
    }

    const { page, pageSize, skip } = parseBiPagination(searchParams);
    const statusRaw = searchParams.get("status")?.trim() ?? "todos";

    const where: Prisma.TicketWhereInput = {
      status: statusRaw === "todos" ? { not: "borrador" } : (statusRaw as Prisma.EnumTicketStatusFilter["equals"]),
    };

    if (dateRange.from || dateRange.to) {
      where.createdAt = {
        ...(dateRange.from ? { gte: dateRange.from } : {}),
        ...(dateRange.to ? { lte: dateRange.to } : {}),
      };
    }

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: ticketInclude,
        skip,
        take: pageSize,
      }),
    ]);

    const now = new Date();
    const items = tickets.map((t) => mapTicketToBiRow(t, now));
    const pages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
      generatedAt: now.toISOString(),
      range: dateRange,
      page,
      pageSize,
      total,
      pages,
      hasMore: page < pages,
      items,
    });
  } catch (error) {
    console.error("[bi/tickets]", error);
    return NextResponse.json({ message: "Error al exportar incidencias para BI" }, { status: 500 });
  }
}
