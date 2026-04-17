/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEFAULT_BY_ASSET = {
  validadora: {
    tipo: "Billetaje",
    subtipo: "Informativo",
    subsubtipo: "Validadora sin comunicaciones",
    dominio: "Billetaje",
    origenTecnico: "Comunicaciones",
  },
  sae: {
    tipo: "Estado general",
    subtipo: "No comunica",
    subsubtipo: "Sistema no comunica",
    dominio: "Sistema",
    origenTecnico: "Software",
  },
  router: {
    tipo: "Comunicaciones",
    subtipo: "No comunica",
    subsubtipo: "Vehiculo no comunica",
    dominio: "Comunicaciones",
    origenTecnico: "Red",
  },
  pantalla: {
    tipo: "Estado general",
    subtipo: "No comunica",
    subsubtipo: "Panel Tactil no responde",
    dominio: "Sistema",
    origenTecnico: "Hardware",
  },
};

function nivelImpactoDesdePrioridad(priority) {
  if (priority === "alta") return "Alto";
  if (priority === "media") return "Medio";
  return "Bajo";
}

async function main() {
  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { tipo: null },
        { subtipo: null },
        { subsubtipo: null },
        { dominio: null },
        { nivelImpacto: null },
        { origenTecnico: null },
      ],
    },
    include: {
      asset: true,
    },
  });

  if (tickets.length === 0) {
    console.log("No hay tickets pendientes de backfill.");
    return;
  }

  let updated = 0;
  for (const ticket of tickets) {
    const base = DEFAULT_BY_ASSET[ticket.asset.type];
    if (!base) continue;

    const nivelImpacto = nivelImpactoDesdePrioridad(ticket.priority);
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        tipo: ticket.tipo ?? base.tipo,
        subtipo: ticket.subtipo ?? base.subtipo,
        subsubtipo: ticket.subsubtipo ?? base.subsubtipo,
        dominio: ticket.dominio ?? base.dominio,
        nivelImpacto: ticket.nivelImpacto ?? nivelImpacto,
        origenTecnico: ticket.origenTecnico ?? base.origenTecnico,
        observaciones: ticket.observaciones ?? "",
      },
    });
    updated += 1;
  }

  console.log(`Backfill completado. Tickets actualizados: ${updated}`);
}

main()
  .catch((error) => {
    console.error("Error en backfill de tipologia:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
