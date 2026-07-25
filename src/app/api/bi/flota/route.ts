import { NextResponse } from "next/server";

import { requirePowerBiAuth } from "@/lib/bi-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bi/flota
 *
 * Catálogo de buses (denominador para % flota afectada en Power BI).
 * Header: Authorization: Bearer <POWER_BI_API_KEY>
 */
export async function GET(request: Request) {
  const authError = requirePowerBiAuth(request);
  if (authError) return authError;

  try {
    const buses = await prisma.bus.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        operator: true,
        municipio: true,
        lineas: true,
        description: true,
        _count: { select: { assets: true, tickets: true } },
      },
    });

    const items = buses.map((b) => ({
      vehiculo: b.id,
      operadora: b.operator,
      municipio: b.municipio,
      lineas_catalogo: b.lineas,
      descripcion: b.description ?? "",
      num_activos: b._count.assets,
      num_incidencias_historicas: b._count.tickets,
    }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      total: items.length,
      items,
    });
  } catch (error) {
    console.error("[bi/flota]", error);
    return NextResponse.json({ message: "Error al exportar flota para BI" }, { status: 500 });
  }
}
