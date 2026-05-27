#!/usr/bin/env node
/**
 * Asigna operator="Global" a todos los buses cuyo id empieza por "GL-"
 * y aun no tienen operadora rellena.
 *
 * Idempotente: se puede ejecutar varias veces sin efecto adicional.
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const result = await prisma.bus.updateMany({
  where: {
    id: { startsWith: "GL-" },
    OR: [{ operator: "" }, { operator: { equals: "Global" } }],
  },
  data: { operator: "Global" },
});

console.log(`Buses actualizados a operator="Global": ${result.count}`);

const sample = await prisma.bus.findMany({
  take: 5,
  where: { id: { startsWith: "GL-" } },
  select: { id: true, operator: true, municipio: true },
});
console.log("Muestra:");
for (const b of sample) console.log(`  ${b.id} | operator="${b.operator}" | municipio="${b.municipio}"`);

await prisma.$disconnect();
