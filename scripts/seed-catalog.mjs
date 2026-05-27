#!/usr/bin/env node
/**
 * Reemplaza el catalogo de buses y lineas con los datos de los CSV reales.
 *
 * Uso:
 *   node scripts/seed-catalog.mjs                # interactivo (pide confirmacion)
 *   node scripts/seed-catalog.mjs --yes          # no interactivo (CI / scripts)
 *
 * Politica:
 * - Borra TODOS los tickets demo (comments, attachments, reservations) y assets.
 * - Borra TODOS los buses actuales.
 * - Inserta los 118 buses del CSV con operator="", municipio="", lineas="".
 * - Borra TODAS las lineas actuales (si las hubiera) e inserta las 118 del CSV.
 *
 * Idempotente: si lo vuelves a ejecutar deja la BD exactamente igual.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const prisma = new PrismaClient();

const BUSES_CSV = "c:\\Users\\Incidencias\\Downloads\\GuaguasActualesGlobal.csv";
const LINEAS_CSV = "c:\\Users\\Incidencias\\Downloads\\LineasActualesGlobal.csv";

function parseCsv(path) {
  const raw = readFileSync(path, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  // Drop header
  const dataLines = lines.slice(1);
  // Dedupe preserving order
  const seen = new Set();
  const ids = [];
  for (const id of dataLines) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

async function main() {
  const yes = process.argv.includes("--yes") || process.argv.includes("-y");

  const buses = parseCsv(resolve(BUSES_CSV));
  const lineas = parseCsv(resolve(LINEAS_CSV));

  console.log(`Leidos ${buses.length} buses y ${lineas.length} lineas desde CSV.`);

  const [existingBuses, existingTickets, existingAssets, existingLineas] = await Promise.all([
    prisma.bus.count(),
    prisma.ticket.count(),
    prisma.asset.count(),
    prisma.linea.count(),
  ]);
  console.log("\nEstado actual:");
  console.log(`  Buses     : ${existingBuses}`);
  console.log(`  Tickets   : ${existingTickets}`);
  console.log(`  Assets    : ${existingAssets}`);
  console.log(`  Lineas    : ${existingLineas}`);

  if (!yes) {
    console.log("\n[!] Modo simulacion. Anade --yes para aplicar los cambios.");
    return;
  }

  console.log("\n=== Aplicando cambios ===");

  await prisma.$transaction(async (tx) => {
    // 1) Tickets y dependencias
    const ticketIds = await tx.ticket.findMany({ select: { id: true } });
    const ticketIdList = ticketIds.map((t) => t.id);
    if (ticketIdList.length > 0) {
      await tx.ticketComment.deleteMany({ where: { ticketId: { in: ticketIdList } } });
      await tx.ticketAttachment.deleteMany({ where: { ticketId: { in: ticketIdList } } });
      await tx.ticketPartReservation.deleteMany({ where: { ticketId: { in: ticketIdList } } });
      await tx.auditEvent.deleteMany({ where: { ticketId: { in: ticketIdList } } });
      await tx.ticket.deleteMany({ where: { id: { in: ticketIdList } } });
      console.log(`  Borrados ${ticketIdList.length} tickets (y sus comments/attachments/reservations/audit)`);
    }
    // 2) Assets
    const assetsDeleted = await tx.asset.deleteMany({});
    console.log(`  Borrados ${assetsDeleted.count} assets`);
    // 3) Preventive tasks
    const preventivesDeleted = await tx.preventiveTask.deleteMany({});
    console.log(`  Borradas ${preventivesDeleted.count} preventive tasks`);
    // 4) Buses
    const busesDeleted = await tx.bus.deleteMany({});
    console.log(`  Borrados ${busesDeleted.count} buses`);
    // 5) Lineas
    const lineasDeleted = await tx.linea.deleteMany({});
    console.log(`  Borradas ${lineasDeleted.count} lineas`);

    // 6) Inserta buses nuevos.
    //    Regla: todo bus cuyo id empieza por "GL-" pertenece a la operadora Global.
    await tx.bus.createMany({
      data: buses.map((id) => ({
        id,
        operator: id.startsWith("GL-") ? "Global" : "",
        municipio: "",
        lineas: "",
      })),
    });
    // Cada bus necesita al menos un activo (FK obligatorio en Ticket).
    // Creamos SAE-DEFAULT por defecto para que el form de tickets funcione sin
    // configuracion adicional.
    await tx.asset.createMany({
      data: buses.map((id) => ({
        id: `${id}-SAE-DEFAULT`,
        busId: id,
        type: "sae",
        serialNumber: `SN-${id}-01`,
      })),
    });
    console.log(`  Insertados ${buses.length} buses nuevos (con activo SAE-DEFAULT)`);

    // 7) Inserta lineas nuevas
    await tx.linea.createMany({
      data: lineas.map((id) => ({ id })),
    });
    console.log(`  Insertadas ${lineas.length} lineas nuevas`);
  });

  const [finalBuses, finalLineas] = await Promise.all([prisma.bus.count(), prisma.linea.count()]);
  console.log("\n=== Estado final ===");
  console.log(`  Buses  : ${finalBuses}`);
  console.log(`  Lineas : ${finalLineas}`);

  const sampleBuses = await prisma.bus.findMany({ take: 5, orderBy: { id: "asc" }, select: { id: true } });
  const sampleLineas = await prisma.linea.findMany({ take: 5, orderBy: { id: "asc" }, select: { id: true } });
  console.log("\nMuestras:");
  console.log(`  Buses primeros: ${sampleBuses.map((b) => b.id).join(", ")}`);
  console.log(`  Lineas primeras: ${sampleLineas.map((l) => l.id).join(", ")}`);
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
