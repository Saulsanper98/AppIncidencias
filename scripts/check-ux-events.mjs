// Verifica que las métricas UX están aterrizando en BD.
// Uso: node scripts/check-ux-events.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const replacer = (_k, v) => (typeof v === "bigint" ? Number(v) : v);

async function main() {
  const total = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM "UxEvent"');
  console.log("Total UxEvent:", JSON.stringify(total, replacer));

  const byEvent = await prisma.$queryRawUnsafe(
    'SELECT eventName, COUNT(*) AS n FROM "UxEvent" GROUP BY eventName ORDER BY n DESC LIMIT 30'
  );
  console.log("\nPor eventName:");
  console.table(JSON.parse(JSON.stringify(byEvent, replacer)));

  const recent = await prisma.$queryRawUnsafe(
    'SELECT id, eventName, userId, path, durationMs, shift, device, datetime(createdAt) AS at FROM "UxEvent" ORDER BY createdAt DESC LIMIT 10'
  );
  console.log("\nÚltimos 10 eventos:");
  console.table(JSON.parse(JSON.stringify(recent, replacer)));

  const lastHour = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM "UxEvent" WHERE createdAt > datetime('now','-1 hour')`
  );
  console.log("\nÚltima hora:", JSON.stringify(lastHour, replacer));

  const props = await prisma.$queryRawUnsafe(
    `SELECT id, eventName, props FROM "UxEvent" WHERE props IS NOT NULL ORDER BY createdAt DESC LIMIT 5`
  );
  console.log("\nEjemplo de props recientes:");
  for (const row of props) {
    console.log("-", row.eventName, "=>", row.props);
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
