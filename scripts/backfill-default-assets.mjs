#!/usr/bin/env node
/**
 * Crea un activo SAE-DEFAULT para cada Bus que aun no tenga ninguno.
 * Idempotente: solo afecta a buses sin activos.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const buses = await prisma.bus.findMany({
  where: { assets: { none: {} } },
  select: { id: true },
});

console.log(`Buses sin ningun activo: ${buses.length}`);
if (buses.length === 0) {
  console.log("Nada que hacer.");
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.asset.createMany({
  data: buses.map((b) => ({
    id: `${b.id}-SAE-DEFAULT`,
    busId: b.id,
    type: "sae",
    serialNumber: `SN-${b.id}-01`,
  })),
});

console.log(`Creados ${buses.length} activos SAE-DEFAULT.`);
await prisma.$disconnect();
