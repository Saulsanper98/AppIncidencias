#!/usr/bin/env node
/**
 * Migra tickets (y tareas preventivas) desde buses creados sin prefijo de operadora
 * hacia el bus real con prefijo (ej. 1618 → GL-1618).
 *
 * También corrige IDs con guion bajo (GL_1665 → GL-1665).
 *
 * Uso:
 *   node scripts/migrate-unprefixed-bus-tickets.mjs           # simulación
 *   node scripts/migrate-unprefixed-bus-tickets.mjs --apply    # ejecutar
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const PREFIXED_RE = /^([A-Za-z]{2,4})-(.+)$/;
const UNDERSCORE_RE = /^([A-Za-z]{2,4})_(.+)$/;

/** @param {string} id */
function isPrefixedBusId(id) {
  return PREFIXED_RE.test(id);
}

/**
 * @param {string} sourceId
 * @param {Map<string, { operator: string }>} busById
 */
function findTargetBusId(sourceId, busById) {
  const allIds = [...busById.keys()];

  if (isPrefixedBusId(sourceId)) {
    return null;
  }

  const underscore = sourceId.match(UNDERSCORE_RE);
  if (underscore) {
    const normalized = `${underscore[1].toUpperCase()}-${underscore[2]}`;
    if (busById.has(normalized)) return normalized;
  }

  const candidates = allIds.filter((id) => {
    const match = id.match(PREFIXED_RE);
    return match && match[2] === sourceId;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  candidates.sort((a, b) => {
    const aAssigned = busById.get(a)?.operator !== "Sin asignar" ? 0 : 1;
    const bAssigned = busById.get(b)?.operator !== "Sin asignar" ? 0 : 1;
    if (aAssigned !== bAssigned) return aAssigned - bAssigned;
    return a.localeCompare(b, "es");
  });
  return candidates[0];
}

/** @param {{ id: string; type: string }[]} assets */
function pickTargetAsset(assets) {
  if (assets.length === 0) return null;
  return (
    assets.find((a) => a.id.endsWith("-SAE-DEFAULT")) ??
    assets.find((a) => a.type === "sae") ??
    assets[0]
  );
}

async function main() {
  const buses = await prisma.bus.findMany({
    select: {
      id: true,
      operator: true,
      assets: { select: { id: true, type: true } },
      _count: { select: { tickets: true, preventiveTasks: true } },
    },
    orderBy: { id: "asc" },
  });

  const busById = new Map(buses.map((b) => [b.id, b]));
  const sources = buses.filter((b) => !isPrefixedBusId(b.id));

  if (sources.length === 0) {
    console.log("No hay buses sin prefijo. Nada que migrar.");
    return;
  }

  console.log(APPLY ? "=== APLICANDO migración ===" : "=== SIMULACIÓN (añade --apply para ejecutar) ===\n");

  let ticketsMoved = 0;
  let preventivesMoved = 0;
  let recurrencesUpdated = 0;
  let busesDeleted = 0;
  const skipped = [];

  for (const source of sources) {
    const targetId = findTargetBusId(source.id, busById);
    if (!targetId) {
      skipped.push(`${source.id} (sin bus destino con prefijo)`);
      continue;
    }

    const target = busById.get(targetId);
    const targetAsset = pickTargetAsset(target?.assets ?? []);
    if (!targetAsset) {
      skipped.push(`${source.id} → ${targetId} (bus destino sin activos)`);
      continue;
    }

    const ticketCount = source._count.tickets;
    const preventiveCount = source._count.preventiveTasks;

    if (ticketCount === 0 && preventiveCount === 0) {
      console.log(`[omit] ${source.id} → ${targetId}: sin tickets ni preventivos`);
      if (APPLY) {
        await prisma.bus.delete({ where: { id: source.id } });
        busesDeleted += 1;
      }
      continue;
    }

    console.log(
      `[plan] ${source.id} → ${targetId} (${target?.operator}) | tickets=${ticketCount} preventivos=${preventiveCount} activo=${targetAsset.id}`,
    );

    if (!APPLY) {
      ticketsMoved += ticketCount;
      preventivesMoved += preventiveCount;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      if (ticketCount > 0) {
        const updated = await tx.ticket.updateMany({
          where: { busId: source.id },
          data: { busId: targetId, assetId: targetAsset.id },
        });
        ticketsMoved += updated.count;
      }

      if (preventiveCount > 0) {
        const updated = await tx.preventiveTask.updateMany({
          where: { busId: source.id },
          data: { busId: targetId },
        });
        preventivesMoved += updated.count;
      }

      const recurrences = await tx.ticketRecurrence.findMany({
        where: { busId: source.id },
      });
      for (const recurrence of recurrences) {
        let templateJson = recurrence.templateJson;
        try {
          const parsed = JSON.parse(templateJson);
          if (parsed && typeof parsed === "object" && parsed.busId === source.id) {
            parsed.busId = targetId;
            templateJson = JSON.stringify(parsed);
          }
        } catch {
          /* mantener JSON tal cual */
        }
        await tx.ticketRecurrence.update({
          where: { id: recurrence.id },
          data: { busId: targetId, templateJson },
        });
        recurrencesUpdated += 1;
      }

      await tx.bus.delete({ where: { id: source.id } });
      busesDeleted += 1;
    });
  }

  console.log("\n=== Resumen ===");
  console.log(`Tickets migrados      : ${ticketsMoved}`);
  console.log(`Preventivos migrados  : ${preventivesMoved}`);
  console.log(`Recurrencias tocadas  : ${recurrencesUpdated}`);
  console.log(`Buses huérfanos borrados: ${busesDeleted}`);
  if (skipped.length > 0) {
    console.log("\nOmitidos / sin destino:");
    for (const line of skipped) console.log(`  - ${line}`);
  }
  if (!APPLY && (ticketsMoved > 0 || busesDeleted > 0)) {
    console.log("\nEjecuta con --apply para aplicar los cambios.");
  }
}

main()
  .catch((err) => {
    console.error("[X] Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
