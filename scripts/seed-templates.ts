/**
 * Siembra plantillas globales de ticket recurrentes.
 *
 * Ejecutar con:  npx tsx scripts/seed-templates.ts
 *
 * Idempotente: usa `name + scope` como clave lógica para upsert manual
 * (TicketTemplate no tiene unique compuesto en BD). Re-ejecutar actualiza
 * los campos existentes sin duplicar filas.
 *
 * Las plantillas vienen pensadas para el modo "Ticket rápido": tipo +
 * subtipo + subsubtipo válidos según `src/lib/tipologia.ts`, título y
 * descripción listos, y variables operativas (impactedLines/serviceStopped/
 * lineaLabel/servicioLabel/commentInitial) precargadas cuando aplica.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type TemplateSeed = {
  name: string;
  category: string;
  title: string;
  description: string;
  tipo: string;
  subtipo: string;
  subsubtipo: string;
  priority?: "alta" | "media" | "baja" | null;
  impactedLines?: number | null;
  serviceStopped?: boolean | null;
  lineaLabel?: string | null;
  servicioLabel?: string | null;
  commentInitial?: string | null;
};

const TEMPLATES: TemplateSeed[] = [
  {
    name: "SAE no comunica",
    category: "Comunicaciones",
    title: "SAE no comunica con el CCMGC",
    description:
      "El sistema de Ayuda a la Explotación (SAE) ha dejado de enviar datos al centro de control. Revisar comunicaciones del vehículo, intentar reset desde admin y, si persiste, sustituir equipo.",
    tipo: "Comunicaciones",
    subtipo: "No comunica",
    subsubtipo: "Vehiculo no comunica",
    impactedLines: 1,
    serviceStopped: false,
    commentInitial: "Sin datos del vehículo desde el centro de control.",
  },
  {
    name: "Validadora fuera de servicio",
    category: "Billetaje",
    title: "Validadora apagada / sin servicio",
    description:
      "La validadora del bus no responde. El conductor reporta imposibilidad de validar tarjetas. Revisar alimentación, conexiones y reset; si persiste, sustituir equipo.",
    tipo: "Billetaje",
    subtipo: "Apagado",
    subsubtipo: "Validadora inactiva",
    impactedLines: 1,
    serviceStopped: false,
    commentInitial: "Validadora apagada. Conductor avisado de no validar.",
  },
  {
    name: "Salto de viaje",
    category: "Planificación",
    title: "Salto de viaje detectado",
    description:
      "El bus inició el viaje antes de la hora planificada o se saltó una parada del recorrido por error. Confirmar con conductor y registrar incidencia para revisión de planificación.",
    tipo: "Planificacion",
    subtipo: "Incorrecto",
    subsubtipo: "Viaje adelantado",
    impactedLines: 1,
    serviceStopped: false,
    commentInitial: "Salto de viaje reportado. Pendiente confirmar con conductor.",
  },
  {
    name: "Fallo apertura/cierre puertas",
    category: "Operativa",
    title: "Fallo apertura/cierre de puertas",
    description:
      "Las puertas no responden correctamente al pulsador del conductor (no abren, no cierran o se quedan a medias). Revisar mecanismo, fotocélulas y sistema neumático.",
    tipo: "Operativa",
    subtipo: "Error operativo",
    subsubtipo: "No abrir/cerrar puertas",
    impactedLines: 1,
    serviceStopped: false,
    commentInitial: "Fallo intermitente en accionamiento de puertas.",
  },
  {
    name: "Pantalla informativa apagada",
    category: "Hardware",
    title: "Pantalla informativa apagada",
    description:
      "La pantalla del visor está apagada o sin señal. El conductor no ve información operativa del SAE. Revisar alimentación, cableado y, si persiste, sustituir pantalla.",
    tipo: "Estado general",
    subtipo: "Apagado",
    subsubtipo: "Visor apagado",
    impactedLines: 1,
    serviceStopped: false,
    commentInitial: "Pantalla apagada. Conductor sin información operativa.",
  },
  {
    name: "Reset de router",
    category: "Comunicaciones",
    title: "Reset de router solicitado",
    description:
      "Router del vehículo presenta problemas de conectividad intermitente. Se solicita reset remoto. Verificar tras 5 minutos que vuelve a comunicar con normalidad.",
    tipo: "Comunicaciones",
    subtipo: "Reset",
    subsubtipo: "Reset router",
    impactedLines: 1,
    serviceStopped: false,
    commentInitial: "Reset programado. Comprobar comunicación en 5 minutos.",
  },
  {
    name: "Pérdida de cobertura GPS",
    category: "Localización",
    title: "Pérdida de cobertura GPS",
    description:
      "El bus aparece sin localización válida en el mapa del centro de control. Revisar antena GPS, receptor y cableado. Si persiste tras reset, sustituir equipo.",
    tipo: "Localizacion",
    subtipo: "Error",
    subsubtipo: "Error GPS",
    impactedLines: 1,
    serviceStopped: false,
    commentInitial: "Bus sin posición GPS válida en el mapa.",
  },
];

async function upsertTemplate(seed: TemplateSeed) {
  const existing = await prisma.ticketTemplate.findFirst({
    where: { name: seed.name, scope: "global" },
  });
  const data = {
    name: seed.name,
    scope: "global" as const,
    ownerId: null as string | null,
    title: seed.title,
    description: seed.description,
    tipo: seed.tipo,
    subtipo: seed.subtipo,
    subsubtipo: seed.subsubtipo,
    priority: seed.priority ?? null,
    category: seed.category,
    impactedLines: seed.impactedLines ?? null,
    serviceStopped: seed.serviceStopped ?? null,
    lineaLabel: seed.lineaLabel ?? null,
    servicioLabel: seed.servicioLabel ?? null,
    commentInitial: seed.commentInitial ?? null,
  };
  if (existing) {
    await prisma.ticketTemplate.update({ where: { id: existing.id }, data });
    return { action: "updated", id: existing.id, name: seed.name };
  }
  const created = await prisma.ticketTemplate.create({ data });
  return { action: "created", id: created.id, name: seed.name };
}

async function main() {
  console.log(`Sembrando ${TEMPLATES.length} plantillas globales...`);
  for (const seed of TEMPLATES) {
    try {
      const result = await upsertTemplate(seed);
      console.log(`  [${result.action.padEnd(7)}] ${result.name}  (${result.id})`);
    } catch (error) {
      console.error(`  [ERROR  ] ${seed.name}:`, error);
    }
  }
  console.log("Hecho.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
