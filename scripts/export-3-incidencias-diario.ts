/**
 * Genera un informe diario XLSX (mismo diseño) solo con 3 incidencias concretas.
 *
 * Uso: npx tsx --env-file=.env scripts/export-3-incidencias-diario.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { buildDailyReportXlsx, type DailyReportRow } from "../src/lib/daily-report-xlsx";
import type { TicketPriority, TicketStatus } from "../src/lib/domain";

const SUFFIXES = ["AVCNZVBY", "5GVVX45K", "TQY6PJVM"] as const;

function buildTipoLabel(tipo: string | null, subtipo: string | null, subsubtipo: string | null): string {
  const parts = [tipo, subtipo, subsubtipo].filter((p): p is string => !!p && p.trim().length > 0);
  if (parts.length === 0) return "Sin clasificar";
  return parts.join(" · ");
}

const prisma = new PrismaClient();

async function main() {
  const dayStart = new Date(2026, 6, 19, 0, 0, 0, 0);
  const dayEnd = new Date(2026, 6, 19, 23, 59, 59, 999);

  const recent = await prisma.ticket.findMany({
    where: { createdAt: { gte: dayStart, lte: dayEnd } },
    include: { bus: { select: { operator: true } } },
    orderBy: { createdAt: "asc" },
  });

  const matched = SUFFIXES.map((suffix) => {
    const hit = recent.find((t) => t.id.toUpperCase().endsWith(suffix));
    if (!hit) throw new Error(`No encontrada incidencia …${suffix} el 2026-07-19`);
    return hit;
  });

  console.log(
    "Filas:",
    matched.map((t) => ({
      id: t.id.slice(-8).toUpperCase(),
      bus: t.busId,
      p: t.priority,
      at: t.createdAt.toISOString(),
    })),
  );

  const rows: DailyReportRow[] = matched.map((t) => ({
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

  const buffer = await buildDailyReportXlsx(rows, {
    reportDate: dayStart,
    generatedAt: new Date(),
    generatedByName: "Saul",
    generatedByEmail: "saul@movilidadgc.org",
    previousGenerations: 0,
    activeBusesCount: 101,
  });

  const outDir = join(process.cwd(), "exports");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "informe-3-incidencias-2026-07-19.xlsx");
  writeFileSync(outPath, buffer);
  console.log(`OK → ${outPath} (${buffer.byteLength} bytes)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
