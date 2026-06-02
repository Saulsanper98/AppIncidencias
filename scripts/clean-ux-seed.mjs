// Limpia eventos UxEvent sintéticos (seed + smoke_test) que contaminan
// las métricas reales.
//
// Uso:
//   node scripts/clean-ux-seed.mjs --dry   → muestra qué borraría
//   node scripts/clean-ux-seed.mjs         → borra de verdad
//
// Criterios de borrado:
//   1) sessionId LIKE 'seed_%'                (seed-ux-events.mjs)
//   2) json_extract(props, '$.seed') = 'true' o 1  (idem)
//   3) eventName = 'smoke_test'               (test inicial)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

async function main() {
  const replacer = (_k, v) => (typeof v === "bigint" ? Number(v) : v);
  const j = (x) => JSON.stringify(x, replacer, 2);

  const countBefore = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM "UxEvent"`,
  );
  console.log("Total UxEvent antes:", Number(countBefore[0].n));

  const targets = await prisma.$queryRawUnsafe(
    `SELECT
       SUM(CASE WHEN sessionId LIKE 'seed_%' THEN 1 ELSE 0 END) AS seed_session,
       SUM(CASE WHEN json_extract(props,'$.seed') IN ('true', 1) THEN 1 ELSE 0 END) AS seed_prop,
       SUM(CASE WHEN eventName = 'smoke_test' THEN 1 ELSE 0 END) AS smoke,
       SUM(CASE WHEN sessionId LIKE 'seed_%'
                  OR json_extract(props,'$.seed') IN ('true', 1)
                  OR eventName = 'smoke_test'
                THEN 1 ELSE 0 END) AS to_delete
     FROM "UxEvent"`,
  );
  console.log("\nCandidatos a borrar:");
  console.log(j(targets));

  const sampleSeed = await prisma.$queryRawUnsafe(
    `SELECT eventName, COUNT(*) AS n FROM "UxEvent"
     WHERE sessionId LIKE 'seed_%' OR json_extract(props,'$.seed') IN ('true', 1)
     GROUP BY eventName ORDER BY n DESC`,
  );
  console.log("\nPor eventName (seed):");
  console.log(j(sampleSeed));

  if (DRY) {
    console.log("\n[DRY-RUN] no se borra nada.");
    return;
  }

  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM "UxEvent"
     WHERE sessionId LIKE 'seed_%'
        OR json_extract(props,'$.seed') IN ('true', 1)
        OR eventName = 'smoke_test'`,
  );
  console.log("\nFilas borradas:", result);

  const countAfter = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM "UxEvent"`,
  );
  console.log("Total UxEvent después:", Number(countAfter[0].n));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
