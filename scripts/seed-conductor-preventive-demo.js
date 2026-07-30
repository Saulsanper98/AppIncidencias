const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const code = "COND-DEMO-001";
  const nameNormalized = code.toLowerCase();
  let conductor = await prisma.conductor.findUnique({ where: { nameNormalized } });
  if (!conductor) {
    conductor = await prisma.conductor.create({
      data: { name: code, nameNormalized, operator: "Global" },
    });
    console.log("conductor created", conductor.id);
  } else {
    console.log("conductor exists", conductor.id);
  }

  const bus = await prisma.bus.findFirst();
  if (bus) {
    const asset = await prisma.asset.findFirst({ where: { busId: bus.id } });
    if (asset) {
      for (let i = 1; i <= 3; i++) {
        const title = `Demo preventivo ${i}`;
        const existing = await prisma.ticket.findFirst({
          where: { conductorId: conductor.id, title },
        });
        if (!existing) {
          await prisma.ticket.create({
            data: {
              busId: bus.id,
              assetId: asset.id,
              title,
              description: "Ticket de prueba para caso preventivo de conductor.",
              status: "abierto",
              priority: "media",
              slaDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000),
              conductorLabel: code,
              conductorId: conductor.id,
              falloOrigen: "conductor",
              tipo: "General",
              subtipo: "Otros",
              subsubtipo: "Sin clasificar",
              dominio: "Operacion",
              nivelImpacto: "Medio",
              origenTecnico: "Demo",
            },
          });
        }
      }
    }
  }

  let cse = await prisma.conductorPreventiveCase.findFirst({
    where: { conductorId: conductor.id, status: { in: ["abierto", "en_proceso"] } },
  });
  if (!cse) {
    cse = await prisma.conductorPreventiveCase.create({
      data: {
        conductorId: conductor.id,
        title: `Preventivo conductor · ${code}`,
        description: "Caso de prueba: umbral de tickets de origen conductor (demo).",
        status: "abierto",
        ticketCountAtOpen: 5,
        windowDays: 30,
      },
    });
    await prisma.conductorPreventiveComment.create({
      data: {
        caseId: cse.id,
        body: "Comentario de prueba: revisar historial del conductor y citar a operaciones.",
        authorName: "Sistema (demo)",
      },
    });
    console.log("case created", cse.id);
  } else {
    console.log("case exists", cse.id);
  }

  console.log(`OPEN /preventivo/${cse.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
