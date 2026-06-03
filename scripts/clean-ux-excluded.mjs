// Borra eventos UxEvent de las cuentas excluidas de métricas
// (propietarios, dev). Mantiene la lista sincronizada con
// `src/lib/ux-exclusions.ts`.
//
// Uso:
//   node scripts/clean-ux-excluded.mjs --dry   → muestra qué borraría
//   node scripts/clean-ux-excluded.mjs         → borra de verdad

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

// Mantener en sincronía con src/lib/ux-exclusions.ts
const EXCLUDED_EMAILS = [
  "saul@movilidadgc.org",
  "jefedesala@movilidadgc.org",
  "read@movilidadgc.org",
];

async function main() {
  const replacer = (_k, v) => (typeof v === "bigint" ? Number(v) : v);
  const j = (x) => JSON.stringify(x, replacer, 2);

  const users = await prisma.user.findMany({
    where: { email: { in: EXCLUDED_EMAILS } },
    select: { id: true, email: true, name: true },
  });
  if (users.length === 0) {
    console.log("No se encontraron usuarios excluidos en la BD.");
    return;
  }
  console.log("Usuarios excluidos:");
  for (const u of users) console.log(`  · ${u.email} (${u.id}) — ${u.name}`);

  const ids = users.map((u) => u.id);
  const safe = ids.filter((id) => /^[a-z0-9]+$/i.test(id));
  const list = safe.map((id) => `'${id}'`).join(",");

  const before = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM "UxEvent"`,
  );
  const toDelete = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM "UxEvent" WHERE userId IN (${list})`,
  );
  const byEvent = await prisma.$queryRawUnsafe(
    `SELECT eventName, COUNT(*) AS n FROM "UxEvent" WHERE userId IN (${list})
     GROUP BY eventName ORDER BY n DESC`,
  );

  console.log(`\nTotal UxEvent: ${Number(before[0].n)}`);
  console.log(`A borrar: ${Number(toDelete[0].n)}`);
  console.log("\nPor eventName:");
  console.log(j(byEvent));

  if (DRY) {
    console.log("\n[DRY-RUN] no se borra nada.");
    return;
  }

  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM "UxEvent" WHERE userId IN (${list})`,
  );
  console.log(`\nFilas borradas: ${result}`);

  const after = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM "UxEvent"`,
  );
  console.log(`Total UxEvent después: ${Number(after[0].n)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
