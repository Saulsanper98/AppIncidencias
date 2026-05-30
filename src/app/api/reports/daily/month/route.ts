import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

/**
 * Devuelve, para el mes indicado (YYYY-MM), un mapa
 *   { "YYYY-MM-DD": <numero de generaciones del informe diario> }
 *
 * Lo usa el selector inline de "Informe diario" para pintar un puntito en
 * los dias que ya tienen informes generados, dando contexto visual sin
 * tener que hacer una llamada por dia.
 */
export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ymParam = (searchParams.get("ym") ?? "").trim();
    const m = /^(\d{4})-(\d{2})$/.exec(ymParam);
    const now = new Date();
    const year = m ? Number(m[1]) : now.getFullYear();
    const month = m ? Number(m[2]) - 1 : now.getMonth();

    const first = new Date(year, month, 1, 0, 0, 0, 0);
    const last = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const firstIso = formatLocalIsoDate(first);
    const lastIso = formatLocalIsoDate(last);

    const groups = await prisma.dailyReport.groupBy({
      by: ["reportDate"],
      where: { reportDate: { gte: firstIso, lte: lastIso } },
      _count: { _all: true },
    });

    const days: Record<string, number> = {};
    for (const g of groups) days[g.reportDate] = g._count._all;

    return NextResponse.json({
      ym: `${year}-${String(month + 1).padStart(2, "0")}`,
      days,
    });
  } catch (error) {
    console.error("Error en /api/reports/daily/month:", error);
    return NextResponse.json({ message: "No se pudo cargar el mes" }, { status: 500 });
  }
}

function formatLocalIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
