#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PREFIXED = /^[A-Za-z]{2,4}-/;

const buses = await prisma.bus.findMany({
  select: {
    id: true,
    operator: true,
    _count: { select: { tickets: true, preventiveTasks: true, assets: true } },
  },
  orderBy: { id: "asc" },
});

const unprefixed = buses.filter((b) => !PREFIXED.test(b.id));
console.log(`Buses sin prefijo: ${unprefixed.length}\n`);

for (const b of unprefixed) {
  const candidates = buses.filter(
    (x) => PREFIXED.test(x.id) && x.id.split("-").slice(1).join("-") === b.id,
  );
  console.log(
    `${b.id} | tickets=${b._count.tickets} preventives=${b._count.preventiveTasks} assets=${b._count.assets}`,
  );
  if (candidates.length === 0) {
    console.log("  -> SIN DESTINO");
  } else {
    for (const c of candidates) {
      console.log(`  -> ${c.id} (${c.operator}) tickets=${c._count.tickets}`);
    }
  }
}

await prisma.$disconnect();
