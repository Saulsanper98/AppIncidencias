/**
 * Rellena TicketStatusChange para tickets resueltos sin historial de cierre.
 *
 *   npx tsx scripts/backfill-resolution-status-history.ts
 *   npx tsx scripts/backfill-resolution-status-history.ts --dry-run
 *
 * Atribuye el cierre al técnico asignado (o al creador si no hay asignación).
 * Fecha del evento: resolvedAt ?? updatedAt del ticket.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const tickets = await prisma.ticket.findMany({
    where: {
      status: "resuelto",
      statusHistory: { none: { toStatus: "resuelto" } },
    },
    select: {
      id: true,
      assignedToUserId: true,
      createdByUserId: true,
      resolvedAt: true,
      updatedAt: true,
      assignedTo: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { updatedAt: "asc" },
  });

  console.log(
    dryRun
      ? `[DRY-RUN] Tickets resueltos sin historial de cierre: ${tickets.length}`
      : `Tickets resueltos sin historial de cierre: ${tickets.length}`,
  );

  if (tickets.length === 0) {
    console.log("Nada que rellenar.");
    return;
  }

  let created = 0;
  for (const ticket of tickets) {
    const changedByUserId = ticket.assignedToUserId ?? ticket.createdByUserId ?? null;
    const changedByName =
      ticket.assignedTo?.name ?? ticket.createdBy?.name ?? "Sistema (histórico)";
    const createdAt = ticket.resolvedAt ?? ticket.updatedAt;

    if (dryRun) {
      console.log(
        `  [+ crear] ${ticket.id.slice(-8)} → ${changedByName} @ ${createdAt.toISOString().slice(0, 10)}`,
      );
      created++;
      continue;
    }

    await prisma.ticketStatusChange.create({
      data: {
        ticketId: ticket.id,
        fromStatus: null,
        toStatus: "resuelto",
        changedByUserId,
        changedByName,
        comment: "[Backfill] Cierre histórico sin registro en TicketStatusChange",
        createdAt,
      },
    });
    created++;
  }

  console.log(dryRun ? `[DRY-RUN] Se crearían ${created} registros.` : `Creados ${created} registros.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
