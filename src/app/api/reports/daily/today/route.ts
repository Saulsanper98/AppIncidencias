import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

/**
 * Devuelve el estado del informe diario para "hoy" (zona horaria del servidor).
 *
 * Permite al cliente:
 *   - Saber si ya se generó hoy (por quién y cuántas veces).
 *   - Mostrar un aviso "X compa\u00f1ero ya lo gener\u00f3 a las HH:mm" antes de
 *     volverlo a sacar.
 *
 * Nunca bloquea la generación: el aviso es informativo.
 */
export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }

    // ?date=YYYY-MM-DD opcional; por defecto, hoy en la zona horaria local
    // del servidor (la app es de uso interno, todos están en la misma TZ).
    const { searchParams } = new URL(request.url);
    const requestedDate = (searchParams.get("date") ?? "").trim();
    const targetDate = isValidIsoDate(requestedDate) ? requestedDate : formatLocalIsoDate(new Date());

    const reports = await prisma.dailyReport.findMany({
      where: { reportDate: targetDate },
      orderBy: { createdAt: "asc" },
      include: {
        generatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({
      reportDate: targetDate,
      count: reports.length,
      generatedToday: reports.length > 0,
      reports: reports.map((r) => ({
        id: r.id,
        ticketCount: r.ticketCount,
        createdAt: r.createdAt.toISOString(),
        generatedByName: r.generatedBy?.name ?? null,
        generatedByEmail: r.generatedBy?.email ?? null,
        /** True si fue el propio usuario que pregunta (para no decir "ya lo hiciste tú"). */
        wasMine: r.generatedById === actor.userId,
      })),
    });
  } catch (error) {
    console.error("Error checking daily report:", error);
    return NextResponse.json({ message: "No se pudo comprobar el informe" }, { status: 500 });
  }
}

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

/** Fecha local en YYYY-MM-DD (zona horaria del proceso, sin UTC drift). */
function formatLocalIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
