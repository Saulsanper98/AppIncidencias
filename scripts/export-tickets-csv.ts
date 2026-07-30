/**
 * Exporta incidencias a Excel (.xlsx) bien formateado para el periodo indicado.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/export-tickets-csv.ts
 *   npx tsx --env-file=.env scripts/export-tickets-csv.ts --from=2026-04-01 --to=2026-07-18
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  buildTicketsExportWorkbook,
  ticketsXlsxFilename,
  type TicketExportRow,
} from "../src/lib/tickets/ticket-export-xlsx";

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const out: { from?: string; to?: string; outDir?: string } = {};
  for (const arg of argv) {
    if (arg.startsWith("--from=")) out.from = arg.slice("--from=".length);
    else if (arg.startsWith("--to=")) out.to = arg.slice("--to=".length);
    else if (arg.startsWith("--out=")) out.outDir = arg.slice("--out=".length);
  }
  return out;
}

function startOfDayLocal(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfDayLocal(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function todayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fromIso = args.from ?? "2026-04-01";
  const toIso = args.to ?? todayIsoLocal();
  const from = startOfDayLocal(fromIso);
  const to = endOfDayLocal(toIso);
  const exportedAt = new Date();

  console.log(`Exportando incidencias del ${fromIso} al ${toIso} → Excel…`);

  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { incidentOccurredAt: { gte: from, lte: to } },
        {
          AND: [{ incidentOccurredAt: null }, { createdAt: { gte: from, lte: to } }],
        },
        { createdAt: { gte: from, lte: to } },
      ],
    },
    include: {
      bus: { select: { operator: true, municipio: true } },
      asset: { select: { type: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const unique = new Map(tickets.map((t) => [t.id, t]));
  const nowMs = exportedAt.getTime();

  const rows: TicketExportRow[] = Array.from(unique.values()).map((t) => {
    const slaOverdue =
      t.status !== "resuelto" && t.slaDeadline.getTime() < nowMs;
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      operator: t.bus.operator ?? "",
      busId: t.busId,
      municipio: t.bus.municipio ?? "",
      tipo: t.tipo ?? "",
      subtipo: t.subtipo ?? "",
      subsubtipo: t.subsubtipo ?? "",
      dominio: t.dominio ?? "",
      nivelImpacto: t.nivelImpacto ?? "",
      assetType: t.asset.type,
      linea: t.lineaLabel ?? "",
      servicio: t.servicioLabel ?? "",
      serviceStopped: t.serviceStopped,
      impactedLines: t.impactedLines,
      conductor: t.conductorLabel ?? "",
      assignedTo: t.assignedTo?.name ?? "Sin asignar",
      slaDeadline: t.slaDeadline,
      slaOverdue,
      incidentOccurredAt: t.incidentOccurredAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      needsCompletion: t.needsCompletion,
      lat: t.latitude ?? "",
      lng: t.longitude ?? "",
    };
  });

  rows.sort((a, b) => {
    const ta = (a.incidentOccurredAt ?? a.createdAt).getTime();
    const tb = (b.incidentOccurredAt ?? b.createdAt).getTime();
    return ta - tb;
  });

  const workbook = await buildTicketsExportWorkbook(rows, {
    statusLabel: "Todos",
    priorityLabel: "Todas",
    operator: "Todas",
    busId: "Todos",
    partCode: "—",
    onlyMine: false,
    dateRangeLabel: `${fromIso} → ${toIso}`,
    dateFrom: fromIso,
    dateTo: toIso,
    exportedBy: "Exportación local",
    exportedAt,
    totalRows: rows.length,
    maxRows: rows.length,
  });

  const outDir = args.outDir ?? join(process.cwd(), "exports");
  mkdirSync(outDir, { recursive: true });
  const filename = `incidencias_${fromIso}_a_${toIso}_${ticketsXlsxFilename(exportedAt).replace(/^tickets_ccmgc_/, "")}`;
  const outPath = join(outDir, filename);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  writeFileSync(outPath, buffer);

  console.log(`OK: ${rows.length} incidencias → ${outPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
