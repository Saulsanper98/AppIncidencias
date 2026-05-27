#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const [buses, tickets, assets, preventives, users] = await Promise.all([
  prisma.bus.count(),
  prisma.ticket.count(),
  prisma.asset.count(),
  prisma.preventiveTask.count(),
  prisma.user.count(),
]);

console.log("=== Estado actual del catalogo ===");
console.log(`Buses          : ${buses}`);
console.log(`Tickets        : ${tickets}`);
console.log(`Assets         : ${assets}`);
console.log(`PreventiveTask : ${preventives}`);
console.log(`Users          : ${users}`);

const busSample = await prisma.bus.findMany({
  take: 5,
  select: { id: true, operator: true, municipio: true, lineas: true },
});
console.log("\nMuestra de buses actuales (max 5):");
for (const b of busSample) console.log(`  ${b.id}  | ${b.operator} | ${b.municipio} | ${b.lineas}`);

const orphan = await prisma.bus.count({
  where: {
    tickets: { none: {} },
    assets: { none: {} },
    preventiveTasks: { none: {} },
  },
});
const kept = buses - orphan;
console.log(`\nBuses sin tickets/assets/preventives: ${orphan}`);
console.log(`Buses con relaciones (no borrables) : ${kept}`);

await prisma.$disconnect();
