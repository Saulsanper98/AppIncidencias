import { NextResponse } from "next/server";

import { requirePowerBiAuth } from "@/lib/bi-auth";
import { mapTicketToBiRow } from "@/lib/bi/ticket-row";
import { parseBiDateRange } from "@/lib/bi/parse-range";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * GET /api/bi/kpis
 *
 * Agregados precalculados (complemento a DAX en Power BI).
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

    const where: Prisma.TicketWhereInput = {
      status: { not: "borrador" },
      ...(dateRange.from || dateRange.to
        ? {
            createdAt: {
              ...(dateRange.from ? { gte: dateRange.from } : {}),
              ...(dateRange.to ? { lte: dateRange.to } : {}),
            },
          }
        : {}),
    };

    const [tickets, fleetTotal, previousWhere] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          bus: { select: { operator: true, municipio: true } },
          asset: { select: { type: true } },
          assignedTo: { select: { name: true } },
        },
      }),
      prisma.bus.count(),
      buildPreviousPeriodWhere(dateRange),
    ]);

    const previousTickets =
      previousWhere === null
        ? []
        : await prisma.ticket.findMany({
            where: previousWhere,
            select: { id: true, busId: true, createdAt: true },
          });

    const now = new Date();
    const rows = tickets.map((t) => mapTicketToBiRow(t, now));

    const byTipologia = aggregateCount(rows, (r) => r.tipologia || "—");
    const byOperadora = aggregateCount(rows, (r) => r.operadora || "—");
    const byImpacto = aggregateCount(rows, (r) => r.impacto || "—");
    const byCriticidad = aggregateCount(rows, (r) => r.criticidad || "—");

    const vehiculosAfectados = new Set(rows.map((r) => r.vehiculo)).size;
    const lineasAfectadas = new Set(rows.map((r) => r.linea).filter(Boolean)).size;
    const expedicionesAfectadas = new Set(rows.map((r) => r.servicio).filter(Boolean)).size;
    const conServicioDetenido = rows.filter((r) => r.servicio_detenido).length;

    const horasAfeccionTotal = rows.reduce((sum, r) => sum + (r.horas_afeccion_servicio ?? 0), 0);

    const monthlyMap = new Map<string, number>();
    for (const r of rows) {
      const key = monthKey(new Date(r.creado));
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
    }
    const evolucion_mensual = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, total_incidencias]) => ({ mes, total_incidencias }));

    const topIncidencias = aggregateCount(rows, (r) => r.incidencia || r.tipologia || "—")
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    const topVehiculos = aggregateCount(rows, (r) => r.vehiculo)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const tendenciaOperadora = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const op = r.operadora || "—";
      const mes = monthKey(new Date(r.creado));
      if (!tendenciaOperadora.has(op)) tendenciaOperadora.set(op, new Map());
      const mesMap = tendenciaOperadora.get(op)!;
      mesMap.set(mes, (mesMap.get(mes) ?? 0) + 1);
    }
    const tendencias_por_operadora = Array.from(tendenciaOperadora.entries()).flatMap(([operadora, mesMap]) =>
      Array.from(mesMap.entries()).map(([mes, total_incidencias]) => ({
        operadora,
        mes,
        total_incidencias,
      })),
    );

    return NextResponse.json({
      generatedAt: now.toISOString(),
      range: dateRange,
      totales: {
        incidencias: rows.length,
        vehiculos_afectados: vehiculosAfectados,
        lineas_afectadas: lineasAfectadas,
        expediciones_afectadas: expedicionesAfectadas,
        pct_flota_afectada: fleetTotal > 0 ? Math.round((vehiculosAfectados / fleetTotal) * 10000) / 100 : null,
        pct_incidencias_servicio_detenido:
          rows.length > 0 ? Math.round((conServicioDetenido / rows.length) * 10000) / 100 : null,
        horas_afeccion_servicio_acumuladas: Math.round(horasAfeccionTotal * 100) / 100,
        incidencias_mes_anterior: previousTickets.length,
        variacion_incidencias_pct:
          previousTickets.length > 0
            ? Math.round(((rows.length - previousTickets.length) / previousTickets.length) * 10000) / 100
            : null,
      },
      por_tipologia: byTipologia,
      por_operadora: byOperadora,
      por_impacto: byImpacto,
      por_criticidad: byCriticidad,
      evolucion_mensual,
      top_incidencias_recurrentes: topIncidencias,
      top_vehiculos_recurrentes: topVehiculos,
      tendencias_por_operadora,
      flota_total: fleetTotal,
    });
  } catch (error) {
    console.error("[bi/kpis]", error);
    return NextResponse.json({ message: "Error al calcular KPIs para BI" }, { status: 500 });
  }
}

function aggregateCount<T>(rows: T[], keyFn: (row: T) => string): { clave: string; total: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([clave, total]) => ({ clave, total }));
}

function buildPreviousPeriodWhere(
  range: ReturnType<typeof parseBiDateRange>,
): Prisma.TicketWhereInput | null {
  if (!range.from || !range.to) return null;
  const ms = range.to.getTime() - range.from.getTime();
  const prevUntil = new Date(range.from.getTime() - 1);
  const prevFrom = new Date(prevUntil.getTime() - ms);
  return {
    status: { not: "borrador" },
    createdAt: { gte: prevFrom, lte: prevUntil },
  };
}
