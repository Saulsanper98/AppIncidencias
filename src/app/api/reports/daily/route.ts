import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { buildDailyReportXlsx, type DailyReportRow } from "@/lib/daily-report-xlsx";
import type { TicketPriority, TicketStatus } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

/**
 * Genera el informe diario en XLSX y lo devuelve como descarga.
 *
 * Comportamiento clave:
 *   - Si otro companero ya lo genero hoy, **NO bloquea**: genera igualmente.
 *     El cliente debio avisar al usuario antes (lo controla por GET /today).
 *   - Cada generacion queda registrada en `DailyReport` y en `AuditEvent`.
 *
 * El rango horario del informe es "el dia local" (00:00 a 23:59:59 del huso
 * del servidor). Esto coincide con la practica actual del equipo.
 */
export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }

    // Aceptamos un body con:
    //   - date?: "YYYY-MM-DD"            (opcional, default: hoy)
    //   - activeBusesCount?: number       (opcional, foto de vehículos activos
    //                                      en el turno; el operador lo introduce
    //                                      al pulsar Generar). Es un valor INDEPENDIENTE
    //                                      por generación: no se suma entre informes.
    let requestedDate: string | null = null;
    let activeBusesCount: number | null = null;
    try {
      const body = (await request.json()) as {
        date?: unknown;
        activeBusesCount?: unknown;
      } | null;
      if (body && typeof body.date === "string" && isValidIsoDate(body.date)) {
        requestedDate = body.date;
      }
      if (body && typeof body.activeBusesCount === "number") {
        const raw = body.activeBusesCount;
        if (Number.isFinite(raw) && raw >= 0 && raw <= 9999) {
          activeBusesCount = Math.round(raw);
        }
      }
    } catch {
      // Body vacio o no-JSON: usamos hoy y sin activeBusesCount.
    }

    const now = new Date();
    const targetDay = requestedDate ? parseLocalIsoDate(requestedDate) : now;
    const { startOfDay, endOfDay } = computeDayBounds(targetDay);
    const reportDateIso = formatLocalIsoDate(targetDay);

    // Recogemos los tickets creados en el dia. Es el criterio que usan
    // actualmente los companeros: cuantas incidencias reportadas en ese dia.
    const tickets = await prisma.ticket.findMany({
      where: {
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { createdAt: "asc" },
      include: {
        bus: { select: { operator: true } },
      },
    });

    const rows: DailyReportRow[] = tickets.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      busId: t.busId,
      operator: t.bus.operator,
      lineaLabel: t.lineaLabel ?? null,
      servicioLabel: t.servicioLabel ?? null,
      conductorLabel: t.conductorLabel ?? null,
      tipoLabel: buildTipoLabel(t.tipo, t.subtipo, t.subsubtipo),
      status: t.status as TicketStatus,
      priority: t.priority as TicketPriority,
      title: t.title,
      description: t.description,
    }));

    // Quien soy (para meta y registro). Cargamos tambien el nombre completo.
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, name: true, email: true },
    });

    // Contamos generaciones previas para mostrarlas al Jefe.
    const previousGenerations = await prisma.dailyReport.count({
      where: { reportDate: reportDateIso },
    });

    const buffer = await buildDailyReportXlsx(rows, {
      reportDate: targetDay,
      generatedAt: now,
      generatedByName: user?.name ?? "Usuario desconocido",
      generatedByEmail: user?.email ?? "",
      previousGenerations,
      activeBusesCount,
    });

    // Registramos la generacion (tras un build exitoso) para la proxima consulta.
    await prisma.dailyReport.create({
      data: {
        reportDate: reportDateIso,
        ticketCount: rows.length,
        generatedById: actor.userId,
      },
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "report.daily.generated",
      detail: `Gener? informe diario (${reportDateIso}, ${rows.length} incidencias)`,
    });

    const filename = `informe-incidencias-${reportDateIso}.xlsx`;
    // Devolvemos como Blob para que los tipos estrictos de Next 15 (BodyInit)
    // acepten el binario sin recursos extra.
    const blob = new Blob([new Uint8Array(buffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating daily report:", error);
    return NextResponse.json({ message: "No se pudo generar el informe" }, { status: 500 });
  }
}

function computeDayBounds(d: Date): { startOfDay: Date; endOfDay: Date } {
  const startOfDay = new Date(d);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(d);
  endOfDay.setHours(23, 59, 59, 999);
  return { startOfDay, endOfDay };
}

function formatLocalIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseLocalIsoDate(s);
  return !Number.isNaN(d.getTime());
}

/** Construye una fecha en la TZ local del proceso a partir de YYYY-MM-DD. */
function parseLocalIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => Number(n));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function buildTipoLabel(
  tipo: string | null,
  subtipo: string | null,
  subsubtipo: string | null,
): string {
  const parts = [tipo, subtipo, subsubtipo].filter((p): p is string => !!p && p.trim().length > 0);
  if (parts.length === 0) return "Sin clasificar";
  return parts.join(" \u00b7 ");
}
