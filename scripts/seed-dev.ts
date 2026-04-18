/**
 * Rellena datos mínimos de desarrollo (catálogo) y, si no hay tickets, algunos de ejemplo.
 * Uso: npm run db:seed  (requiere .env con DATABASE_URL y haber aplicado migraciones)
 */
import type { TicketPriority, TicketStatus } from "@/lib/domain";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";

async function seedDemoTicketsIfEmpty() {
  const existing = await prisma.ticket.count();
  if (existing > 0) {
    console.log(`Tickets ya existentes (${existing}); no se crean ejemplos.`);
    return;
  }

  const now = new Date();
  const inMinutes = (m: number) => new Date(now.getTime() + m * 60_000);

  type Demo = {
    busId: string;
    assetId: string;
    title: string;
    description: string;
    status: TicketStatus;
    priority: TicketPriority;
    tipo: string;
    subtipo: string;
    subsubtipo: string;
    dominio: string;
    nivelImpacto: string;
    origenTecnico: string;
    observaciones: string;
    slaDeadline: Date;
  };

  const demos: Demo[] = [
    {
      busId: "GC-117",
      assetId: "VAL-117-A",
      title: "Demo: validadora sin comunicaciones",
      description: "Ticket de ejemplo generado por npm run db:seed.",
      status: "abierto",
      priority: "alta",
      tipo: "Billetaje",
      subtipo: "Informativo",
      subsubtipo: "Validadora sin comunicaciones",
      dominio: "Billetaje",
      nivelImpacto: "Alto",
      origenTecnico: "Comunicaciones",
      observaciones: "Datos de demostración.",
      slaDeadline: inMinutes(25),
    },
    {
      busId: "GUA-032",
      assetId: "RTR-032-B",
      title: "Demo: router con pérdidas de señal",
      description: "Segundo ticket de ejemplo para probar listados y filtros.",
      status: "en_proceso",
      priority: "media",
      tipo: "Comunicaciones",
      subtipo: "No comunica",
      subsubtipo: "Vehiculo no comunica",
      dominio: "Comunicaciones",
      nivelImpacto: "Medio",
      origenTecnico: "Red",
      observaciones: "",
      slaDeadline: inMinutes(90),
    },
    {
      busId: "SBT-088",
      assetId: "PAN-088-A",
      title: "Demo: pantalla TFT intermitente",
      description: "Tercer ticket de ejemplo (estado distinto).",
      status: "esperando_repuesto",
      priority: "media",
      tipo: "Estado general",
      subtipo: "No comunica",
      subsubtipo: "Panel Tactil no responde",
      dominio: "Sistema",
      nivelImpacto: "Medio",
      origenTecnico: "Hardware",
      observaciones: "Pendiente de repuesto en almacén.",
      slaDeadline: inMinutes(180),
    },
  ];

  for (const d of demos) {
    await prisma.ticket.create({
      data: {
        busId: d.busId,
        assetId: d.assetId,
        title: d.title,
        description: d.description,
        status: d.status,
        priority: d.priority,
        tipo: d.tipo,
        subtipo: d.subtipo,
        subsubtipo: d.subsubtipo,
        dominio: d.dominio,
        nivelImpacto: d.nivelImpacto,
        origenTecnico: d.origenTecnico,
        observaciones: d.observaciones,
        slaDeadline: d.slaDeadline,
      },
    });
  }

  console.log(`Creados ${demos.length} tickets de demostración.`);
}

async function main() {
  await ensureCatalogSeeded();
  console.log("Catálogo de desarrollo listo (buses, activos, almacenes, repuestos, stock, usuarios).");

  await seedDemoTicketsIfEmpty();
}

main()
  .catch((error) => {
    console.error("Error en db:seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
