/**
 * Exportador del listado de tickets a XLSX.
 *
 * Replica los filtros del `GET /api/tickets` (status, priority, operator,
 * busId, partCode, mine) y devuelve un Excel con:
 *  - Hoja "Tickets": fila por ticket con los campos clave.
 *  - Hoja "Filtros": resumen de qué filtros se aplicaron.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import type { TicketPriority, TicketStatus } from "@/lib/domain";
import { resolveRequestActor } from "@/lib/auth-context";
import { formatCanary } from "@/lib/datetime/canary";
import { prisma } from "@/lib/prisma";
import {
  normalizeTicketPriorityFilter,
  normalizeTicketStatusFilter,
} from "@/lib/ticket-filters";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/ticket-labels";
import {
  buildTicketsExportWorkbook,
  ticketsXlsxFilename,
  type TicketExportRow,
} from "@/lib/tickets/ticket-export-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 10_000;

type DateRangePreset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "custom";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function resolveDateRange(
  range: string | null,
  fromRaw: string | null,
  toRaw: string | null,
): { from: Date | null; to: Date | null; preset: DateRangePreset | null; label: string } {
  const lower = (range ?? "").toLowerCase();
  const now = new Date();
  switch (lower) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), preset: "today", label: "Hoy" };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y), preset: "yesterday", label: "Ayer" };
    }
    case "last7": {
      const f = new Date(now);
      f.setDate(now.getDate() - 6);
      return { from: startOfDay(f), to: endOfDay(now), preset: "last7", label: "Últimos 7 días" };
    }
    case "last30": {
      const f = new Date(now);
      f.setDate(now.getDate() - 29);
      return { from: startOfDay(f), to: endOfDay(now), preset: "last30", label: "Últimos 30 días" };
    }
    case "thismonth": {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(f), to: endOfDay(now), preset: "thisMonth", label: "Mes en curso" };
    }
    case "lastmonth": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(f), to: endOfDay(t), preset: "lastMonth", label: "Mes anterior" };
    }
    case "custom": {
      const from = fromRaw ? new Date(fromRaw) : null;
      const to = toRaw ? new Date(toRaw) : null;
      const fromOk = from && !Number.isNaN(from.getTime()) ? startOfDay(from) : null;
      const toOk = to && !Number.isNaN(to.getTime()) ? endOfDay(to) : null;
      const label =
        [fromOk?.toISOString().slice(0, 10), toOk?.toISOString().slice(0, 10)].filter(Boolean).join(" → ") ||
        "Personalizado";
      return { from: fromOk, to: toOk, preset: "custom", label };
    }
    default: {
      const from = fromRaw ? new Date(fromRaw) : null;
      const to = toRaw ? new Date(toRaw) : null;
      const fromOk = from && !Number.isNaN(from.getTime()) ? startOfDay(from) : null;
      const toOk = to && !Number.isNaN(to.getTime()) ? endOfDay(to) : null;
      if (!fromOk && !toOk) {
        return { from: null, to: null, preset: null, label: "Sin límite" };
      }
      return {
        from: fromOk,
        to: toOk,
        preset: "custom",
        label: [fromOk?.toISOString().slice(0, 10), toOk?.toISOString().slice(0, 10)].filter(Boolean).join(" → "),
      };
    }
  }
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = normalizeTicketStatusFilter(searchParams.get("status"), { includeBorrador: false });
    const priority = normalizeTicketPriorityFilter(searchParams.get("priority"));
    const operator = searchParams.get("operator");
    const busId = searchParams.get("busId");
    const partCodeRaw = searchParams.get("partCode")?.trim() ?? "";
    const mineRaw = searchParams.get("mine") ?? searchParams.get("assignee");
    const mineActive = mineRaw === "1" || mineRaw === "true" || mineRaw === "me";
    const onlyMine = mineActive && actor.userId ? actor.userId : null;
    const dateRange = resolveDateRange(
      searchParams.get("range"),
      searchParams.get("from"),
      searchParams.get("to"),
    );

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

    const createdAtFilter: Prisma.DateTimeFilter | undefined =
      dateRange.from || dateRange.to
        ? {
            ...(dateRange.from ? { gte: dateRange.from } : {}),
            ...(dateRange.to ? { lte: dateRange.to } : {}),
          }
        : undefined;

    const where: Prisma.TicketWhereInput = {
      status: status === "todos" ? undefined : status,
      priority: priority === "todos" ? undefined : priority,
      busId: busId && busId !== "todas" ? busId : undefined,
      bus: operator && operator !== "todas" ? { operator } : undefined,
      ...(onlyMine ? { assignedToUserId: onlyMine } : {}),
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
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

    const exportedAt = new Date();
    const now = exportedAt;
    const rows: TicketExportRow[] = tickets.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status as TicketStatus,
      priority: t.priority as TicketPriority,
      operator: t.bus.operator,
      busId: t.busId,
      municipio: t.mapPlaceMunicipio?.trim() || t.bus.municipio,
      tipo: t.tipo ?? "",
      subtipo: t.subtipo ?? "",
      subsubtipo: t.subsubtipo ?? "",
      dominio: t.dominio ?? "",
      nivelImpacto: t.nivelImpacto ?? "",
      assetType: t.asset.type,
      linea: t.lineaLabel ?? "",
      servicio: t.servicioLabel ?? "",
      conductor: t.conductorLabel ?? "",
      assignedTo: t.assignedTo?.name ?? "",
      slaDeadline: t.slaDeadline,
      slaOverdue: t.status !== "resuelto" && t.slaDeadline.getTime() < now.getTime(),
      incidentOccurredAt: t.incidentOccurredAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      needsCompletion: t.needsCompletion,
      lat: t.latitude ?? "",
      lng: t.longitude ?? "",
    }));

    const workbook = await buildTicketsExportWorkbook(rows, {
      statusLabel: status === "todos" ? "Todos" : TICKET_STATUS_LABELS[status],
      priorityLabel: priority === "todos" ? "Todas" : TICKET_PRIORITY_LABELS[priority],
      operator: operator && operator !== "todas" ? operator : "Todas",
      busId: busId && busId !== "todas" ? busId : "Todos",
      partCode: partCodeRaw || "—",
      onlyMine: Boolean(onlyMine),
      dateRangeLabel: dateRange.label,
      dateFrom: dateRange.from ? formatCanary(dateRange.from, { dateStyle: "short", timeStyle: "short" }) : undefined,
      dateTo: dateRange.to ? formatCanary(dateRange.to, { dateStyle: "short", timeStyle: "short" }) : undefined,
      exportedBy: actor.displayName,
      exportedAt,
      totalRows: tickets.length,
      maxRows: MAX_ROWS,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const rangeSuffix = dateRange.preset ? `_${dateRange.preset.replace(/[^a-z0-9]+/gi, "")}` : "";
    const filename = ticketsXlsxFilename(exportedAt, rangeSuffix);

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exportando tickets:", error);
    return NextResponse.json({ message: "No se pudo exportar la bandeja de tickets" }, { status: 500 });
  }
}
