import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { getLineas } from "@/lib/desvios/serializers";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  if (!canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(180, Math.max(7, Number(searchParams.get("days") ?? 30)));

  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.desvio.findMany({
    where: { creado_en: { gte: since } },
    select: {
      id: true,
      estado: true,
      origen: true,
      lineas_afectadas: true,
    },
  });

  const byEstado: Record<string, number> = {};
  const byOrigen: Record<string, number> = {};
  const byLinea: Record<string, number> = {};

  for (const row of rows) {
    byEstado[row.estado] = (byEstado[row.estado] ?? 0) + 1;
    byOrigen[row.origen] = (byOrigen[row.origen] ?? 0) + 1;
    const lineas = getLineas(row);
    for (const linea of lineas.slice(0, 5)) {
      byLinea[linea] = (byLinea[linea] ?? 0) + 1;
    }
  }

  const topLineas = Object.entries(byLinea)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([linea, count]) => ({ linea, count }));

  return NextResponse.json({
    days,
    since: since.toISOString(),
    total: rows.length,
    byEstado,
    byOrigen,
    topLineas,
    activos: byEstado.ACTIVO ?? 0,
    pendientes: byEstado.PENDIENTE ?? 0,
  });
}
