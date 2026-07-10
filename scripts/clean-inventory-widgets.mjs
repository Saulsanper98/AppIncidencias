/**
 * Elimina widgets de dashboards personalizados cuya fuente es embed_inventory
 * (módulo de inventario retirado de la app).
 *
 * Uso:
 *   node --env-file=.env scripts/clean-inventory-widgets.mjs
 *   node --env-file=.env scripts/clean-inventory-widgets.mjs --dry-run
 */

import { PrismaClient } from "@prisma/client";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

async function main() {
  const stale = await prisma.dashboardWidget.findMany({
    where: { dataSource: "embed_inventory" },
    select: {
      id: true,
      title: true,
      dashboardId: true,
      dashboard: { select: { name: true } },
    },
    orderBy: { dashboardId: "asc" },
  });

  if (stale.length === 0) {
    console.log("No hay widgets embed_inventory en la base de datos.");
    return;
  }

  console.log(`Encontrados ${stale.length} widget(s) de inventario:`);
  for (const w of stale) {
    console.log(`  - ${w.id} "${w.title}" (dashboard: ${w.dashboard.name})`);
  }

  if (dryRun) {
    console.log("\nModo dry-run: no se ha borrado nada.");
    return;
  }

  const result = await prisma.dashboardWidget.deleteMany({
    where: { dataSource: "embed_inventory" },
  });

  console.log(`\nEliminados ${result.count} widget(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
