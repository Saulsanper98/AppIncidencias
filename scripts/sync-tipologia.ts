/**
 * Sincroniza TipologiaEntry en BD con TIPOLOGIA_CSV (manual CCMGC 2026).
 *
 *   npx tsx scripts/sync-tipologia.ts           # aplica cambios
 *   npx tsx scripts/sync-tipologia.ts --dry-run # solo informe
 *
 * - Crea entradas nuevas del catálogo.
 * - Actualiza metadatos y sortOrder de las existentes.
 * - Desactiva (active=false) entradas que ya no están en el catálogo.
 * - No modifica tickets históricos.
 */

import { PrismaClient } from "@prisma/client";

import { TIPOLOGIA_CSV, tipologiaKey } from "../src/lib/tipologia";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const catalogKeys = new Set(TIPOLOGIA_CSV.map(tipologiaKey));
  const existing = await prisma.tipologiaEntry.findMany();

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let deactivated = 0;

  console.log(dryRun ? "[DRY-RUN] Sincronizando tipología…" : "Sincronizando tipología…");
  console.log(`  Catálogo CSV: ${TIPOLOGIA_CSV.length} entradas`);
  console.log(`  BD actual:    ${existing.length} filas (${existing.filter((r) => r.active).length} activas)`);

  for (let index = 0; index < TIPOLOGIA_CSV.length; index++) {
    const item = TIPOLOGIA_CSV[index];
    const key = tipologiaKey(item);
    const row = existing.find((e) => tipologiaKey(e) === key);
    const data = {
      tipo: item.tipo,
      subtipo: item.subtipo,
      subsubtipo: item.subsubtipo,
      dominio: item.dominio,
      nivelImpacto: item.nivelImpacto,
      origenTecnico: item.origenTecnico,
      observaciones: item.observaciones,
      sortOrder: index,
      active: true,
    };

    if (!row) {
      console.log(`  [+ crear] ${item.tipo} / ${item.subtipo} / ${item.subsubtipo}`);
      if (!dryRun) await prisma.tipologiaEntry.create({ data });
      created++;
      continue;
    }

    const needsUpdate =
      row.dominio !== data.dominio ||
      row.nivelImpacto !== data.nivelImpacto ||
      row.origenTecnico !== data.origenTecnico ||
      row.observaciones !== data.observaciones ||
      row.sortOrder !== data.sortOrder ||
      !row.active;

    if (needsUpdate) {
      console.log(`  [~ actualizar] ${item.tipo} / ${item.subtipo} / ${item.subsubtipo}`);
      if (!dryRun) await prisma.tipologiaEntry.update({ where: { id: row.id }, data });
      updated++;
    } else {
      unchanged++;
    }
  }

  for (const row of existing) {
    if (catalogKeys.has(tipologiaKey(row)) || !row.active) continue;
    console.log(`  [- desactivar] ${row.tipo} / ${row.subtipo} / ${row.subsubtipo}`);
    if (!dryRun) await prisma.tipologiaEntry.update({ where: { id: row.id }, data: { active: false } });
    deactivated++;
  }

  console.log("");
  console.log(`Resumen: +${created} creadas, ~${updated} actualizadas, ${unchanged} sin cambios, -${deactivated} desactivadas`);
  if (dryRun) console.log("(dry-run: no se escribió en BD)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
