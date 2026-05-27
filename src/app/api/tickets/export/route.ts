/**
 * Exportador del listado de tickets a XLSX.
 *
 * Replica los filtros del `GET /api/tickets` (status, priority, operator,
 * busId, partCode, mine) y devuelve un Excel con:
 *  - Hoja "Tickets": fila por ticket con los campos clave.
 *  - Hoja "Filtros": resumen de qué filtros se aplicaron.
 *
 * Diseño:
 *  - Usa `exceljs`, igual que las plantillas de catálogo y el daily report.
 *  - `runtime = "nodejs"` (Edge no soporta buffer binario grande).
 *  - Tope de seguridad: 10.000 filas para evitar OOM si alguien intenta
 *    exportar la BD entera sin filtros.
 */

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";

import type { TicketPriority, TicketStatus } from "@/lib/domain";
import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { CANARY_TIMEZONE } from "@/lib/datetime/canary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 10_000;

function normalizeStatus(value: string | null): TicketStatus | "todos" {
  if (!value || value === "todos") return "todos";
  if (
    value === "abierto" ||
    value === "en_proceso" ||
    value === "esperando_repuesto" ||
    value === "resuelto"
  ) {
    return value;
  }
  return "todos";
}

function normalizePriority(value: string | null): TicketPriority | "todos" {
  if (!value || value === "todos") return "todos";
  if (value === "alta" || value === "media" || value === "baja") return value;
  return "todos";
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  abierto: "Abierto",
  en_proceso: "En proceso",
  esperando_repuesto: "Esperando repuesto",
  resuelto: "Resuelto",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

function formatCanary(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: CANARY_TIMEZONE,
  }).format(date);
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = normalizeStatus(searchParams.get("status"));
    const priority = normalizePriority(searchParams.get("priority"));
    const operator = searchParams.get("operator");
    const busId = searchParams.get("busId");
    const partCodeRaw = searchParams.get("partCode")?.trim() ?? "";
    const mineRaw = searchParams.get("mine") ?? searchParams.get("assignee");
    const mineActive = mineRaw === "1" || mineRaw === "true" || mineRaw === "me";
    const onlyMine = mineActive && actor.userId ? actor.userId : null;

    // Resuelve `partCode` igual que el GET: tickets que tengan una reserva
    // de esa pieza (reservada o consumida).
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

    const where: Prisma.TicketWhereInput = {
      status: status === "todos" ? undefined : status,
      priority: priority === "todos" ? undefined : priority,
      busId: busId && busId !== "todas" ? busId : undefined,
      bus: operator && operator !== "todas" ? { operator } : undefined,
      ...(onlyMine ? { assignedToUserId: onlyMine } : {}),
      ...(partTicketIds !== null
        ? partTicketIds.length > 0
          ? { id: { in: partTicketIds } }
          : { id: { equals: "__ccmgc_no_ticket_for_partcode__" } }
        : {}),
    };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        bus: { select: { id: true, operator: true, municipio: true } },
        asset: { select: { type: true } },
        assignedTo: { select: { name: true } },
      },
      take: MAX_ROWS,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CCMGC Ticketing";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Tickets", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = [
      { header: "ID corto", key: "shortId", width: 12 },
      { header: "ID completo", key: "id", width: 28 },
      { header: "Título", key: "title", width: 50 },
      { header: "Estado", key: "status", width: 18 },
      { header: "Prioridad", key: "priority", width: 12 },
      { header: "Operadora", key: "operator", width: 16 },
      { header: "Bus", key: "busId", width: 12 },
      { header: "Municipio", key: "municipio", width: 18 },
      { header: "Tipo", key: "tipo", width: 16 },
      { header: "Subtipo", key: "subtipo", width: 18 },
      { header: "Subsubtipo", key: "subsubtipo", width: 22 },
      { header: "Dominio", key: "dominio", width: 14 },
      { header: "Nivel impacto", key: "nivelImpacto", width: 14 },
      { header: "Línea", key: "linea", width: 12 },
      { header: "Servicio", key: "servicio", width: 12 },
      { header: "Conductor", key: "conductor", width: 18 },
      { header: "Asignado a", key: "assignedTo", width: 22 },
      { header: "SLA (deadline)", key: "slaDeadline", width: 20 },
      { header: "SLA vencido", key: "slaOverdue", width: 12 },
      { header: "Creado", key: "createdAt", width: 20 },
      { header: "Actualizado", key: "updatedAt", width: 20 },
      { header: "Latitud", key: "lat", width: 12 },
      { header: "Longitud", key: "lng", width: 12 },
    ];

    const now = new Date();
    for (const t of tickets) {
      sheet.addRow({
        shortId: t.id.slice(-8).toUpperCase(),
        id: t.id,
        title: t.title,
        status: STATUS_LABELS[t.status as TicketStatus] ?? t.status,
        priority: PRIORITY_LABELS[t.priority as TicketPriority] ?? t.priority,
        operator: t.bus.operator,
        busId: t.busId,
        municipio: t.mapPlaceMunicipio?.trim() || t.bus.municipio,
        tipo: t.tipo ?? "",
        subtipo: t.subtipo ?? "",
        subsubtipo: t.subsubtipo ?? "",
        dominio: t.dominio ?? "",
        nivelImpacto: t.nivelImpacto ?? "",
        linea: t.lineaLabel ?? "",
        servicio: t.servicioLabel ?? "",
        conductor: t.conductorLabel ?? "",
        assignedTo: t.assignedTo?.name ?? "",
        slaDeadline: formatCanary(t.slaDeadline),
        slaOverdue:
          t.status !== "resuelto" && t.slaDeadline.getTime() < now.getTime() ? "Sí" : "",
        createdAt: formatCanary(t.createdAt),
        updatedAt: formatCanary(t.updatedAt),
        lat: t.latitude ?? "",
        lng: t.longitude ?? "",
      });
    }

    // Cabecera en negrita + fila congelada.
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: "middle" };

    // Estilos por prioridad (columna E = Prioridad).
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const prio = String(row.getCell("priority").value ?? "").toLowerCase();
      if (prio === "alta") {
        row.getCell("priority").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEE2E2" },
        };
      } else if (prio === "media") {
        row.getCell("priority").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFEDD5" },
        };
      }
    });

    // Hoja con resumen de filtros aplicados.
    const filtros = workbook.addWorksheet("Filtros");
    filtros.columns = [
      { header: "Filtro", key: "k", width: 24 },
      { header: "Valor", key: "v", width: 40 },
    ];
    filtros.getRow(1).font = { bold: true };
    filtros.addRows([
      { k: "Estado", v: status === "todos" ? "Todos" : STATUS_LABELS[status] },
      { k: "Prioridad", v: priority === "todos" ? "Todas" : PRIORITY_LABELS[priority] },
      { k: "Operadora", v: operator && operator !== "todas" ? operator : "Todas" },
      { k: "Bus", v: busId && busId !== "todas" ? busId : "Todos" },
      { k: "Código pieza", v: partCodeRaw || "—" },
      { k: "Solo míos", v: onlyMine ? "Sí" : "No" },
      { k: "Exportado por", v: actor.displayName },
      { k: "Exportado en", v: formatCanary(new Date()) },
      { k: "Total filas", v: tickets.length },
      { k: "Limite máximo", v: MAX_ROWS },
    ]);

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `tickets_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`;
    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exportando tickets:", error);
    return NextResponse.json(
      { message: "No se pudo exportar la bandeja de tickets" },
      { status: 500 },
    );
  }
}
