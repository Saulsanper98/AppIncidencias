#!/usr/bin/env node
/**
 * Siembra contenido inicial en la base de conocimiento:
 *  - Categorias por defecto (Manuales, FAQs, Casos resueltos, Glosario).
 *  - 4 articulos de ejemplo (uno por categoria).
 *
 * Idempotente: si ya existen no duplica nada.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES = [
  {
    slug: "manuales",
    name: "Manuales",
    description: "Procedimientos paso a paso para resolver incidencias tipicas.",
    icon: "BookOpenCheck",
    order: 0,
  },
  {
    slug: "faqs",
    name: "FAQs",
    description: "Preguntas frecuentes para conductores y tecnicos.",
    icon: "HelpCircle",
    order: 1,
  },
  {
    slug: "casos-resueltos",
    name: "Casos resueltos",
    description: "Incidencias notables resueltas, con su solucion documentada.",
    icon: "FileCheck2",
    order: 2,
  },
  {
    slug: "glosario",
    name: "Glosario",
    description: "Terminos y siglas que se usan en el centro de control.",
    icon: "Library",
    order: 3,
  },
];

const ARTICLES = [
  {
    slug: "como-reportar-una-incidencia",
    title: "Cómo reportar una incidencia",
    summary:
      "Guía paso a paso para que conductores y técnicos abran un ticket completo y bien documentado.",
    categorySlug: "manuales",
    tags: "tickets,reporte,procedimiento",
    contentMd: `# Cómo reportar una incidencia

Reportar una incidencia bien documentada acelera enormemente la resolución. Sigue estos pasos.

## 1. Identifica el bus afectado
Antes de abrir el ticket, asegúrate de tener el código del bus (\`GL-XXXX\`). Si el bus no está en el catálogo, puedes teclearlo tal cual: el sistema lo creará al guardar y el gestor lo completará después.

## 2. Rellena el bloque "Equipo afectado"
- **Bus**: código de la guagua.
- **Línea**: línea/ruta que cubre el bus en ese momento (opcional, autocompleta).
- **Servicio**: turno o código operativo (opcional, texto libre).
- **Conductor**: nombre del conductor si lo conoces.

## 3. Clasifica la tipología
Elige Tipo ? Subtipo ? Incidencia. Si dudas, elige lo más cercano: el técnico podrá ajustarlo más tarde.

## 4. Describe lo ocurrido
- **Título**: una línea corta y específica (no "no funciona").
- **Descripción técnica**: síntomas, contexto, qué pruebas se han hecho.
- **Impacto operativo**: marca si el servicio queda parado y cuántas líneas se ven afectadas.

## 5. Adjunta evidencias
Sube fotos del display, panel de errores, conexiones, etc. Una imagen ahorra horas de diagnóstico.

> **Tip:** Si la incidencia ya está documentada en la KB, enlaza el artículo desde el comentario. Así otros pueden seguir el procedimiento sin esperar al técnico.
`,
  },
  {
    slug: "que-significa-sla-en-un-ticket",
    title: "?Qué significa el SLA de un ticket?",
    summary:
      "El SLA marca el tiempo máximo en que debe atenderse el ticket. Aquí cómo se calcula y qué hacer si está rojo.",
    categorySlug: "faqs",
    tags: "sla,priorización,tiempo",
    contentMd: `# ?Qué significa el SLA de un ticket?

**SLA** = *Service Level Agreement*, el tiempo máximo comprometido para atender la incidencia.

## ?Cómo se calcula?
Depende de la **prioridad** del ticket:

| Prioridad | SLA estándar |
| --------- | ------------ |
| Alta      | 60 minutos   |
| Media     | 4 horas      |
| Baja      | 24 horas     |

Si el activo tiene un SLA específico configurado en el catálogo, ese valor **sustituye** al estándar de prioridad.

## ?Qué significa el donut rojo en la bandeja?
- **Verde**: queda más del 50 % del SLA.
- **Ámbar**: queda entre 20 % y 50 %.
- **Rojo**: queda menos del 20 % o ya está vencido. **Atender prioritariamente.**

## ?Y si vence?
El ticket se marca como **vencido** pero no se cierra automáticamente. Se sigue contabilizando hasta su resolución para análisis posterior.
`,
  },
  {
    slug: "validadora-no-acepta-tarjetas-procedimiento",
    title: "Validadora no acepta tarjetas ? procedimiento estándar",
    summary:
      "Pasos a seguir cuando una validadora deja de leer tarjetas pero el bus sigue en servicio.",
    categorySlug: "manuales",
    tags: "validadora,tarjetas,procedimiento",
    contentMd: `# Validadora no acepta tarjetas

Procedimiento estándar cuando la validadora del bus deja de leer tarjetas pero el resto del sistema funciona.

## Diagnóstico inicial (1-2 min)

1. **Comprueba que la validadora está encendida** (pantalla iluminada).
2. **Mira si hay mensaje de error en pantalla**. Anótalo literal.
3. **Prueba con dos tarjetas distintas** (descarta problema de tarjeta).

## Si no lee ninguna tarjeta

1. Apaga la validadora desde el panel del conductor (5 seg presionado).
2. Espera 30 segundos.
3. Vuelve a encender.

Si tras el reinicio sigue sin leer:

- Reporta ticket con prioridad **media** (si el bus sigue en servicio con cobro alternativo).
- Reporta ticket con prioridad **alta** (si no hay cobro alternativo posible).

## Datos a incluir en el ticket

- Mensaje exacto en pantalla.
- LED del SAE: ?verde, ámbar, rojo?
- Foto de la validadora.
- Foto del panel de errores si lo hubiera.

> **Importante:** No abras la validadora ni desmontes nada. El técnico autorizado se encargará.
`,
  },
  {
    slug: "glosario-terminos-centro-control",
    title: "Glosario del centro de control",
    summary: "Siglas y términos habituales en la operativa CCMGC.",
    categorySlug: "glosario",
    tags: "glosario,siglas,terminologia",
    contentMd: `# Glosario del centro de control

## Activos a bordo

- **SAE**: Sistema de Ayuda a la Explotación. Módulo embarcado que registra posición, tiempos y eventos.
- **Validadora**: equipo que lee tarjetas de transporte y registra la subida del pasajero.
- **Router**: nodo de conectividad celular/wifi del bus.
- **Pantalla**: display de información al pasajero (próxima parada, anuncios).

## Roles

- **Conductor**: opera el vehículo; reporta incidencias pero no resuelve.
- **Técnico de campo**: resuelve incidencias en cochera o en ruta.
- **Gestor de centro de control**: supervisa la operación, gestiona usuarios, catálogo y feedback.

## Estados de ticket

- **Abierto**: recién creado, sin asignar.
- **En proceso**: técnico trabajando.
- **Esperando repuesto**: bloqueado por falta de material.
- **Resuelto**: cerrado correctamente.

## Otros

- **SLA**: tiempo máximo de atención (ver [artículo dedicado](/kb/que-significa-sla-en-un-ticket)).
- **Bandeja**: vista principal con la lista de tickets activos.
- **Línea**: ruta operativa que cubre un bus en un turno (GL-1, GL-30, etc.).
`,
  },
];

async function ensureCategories() {
  const map = new Map();
  for (const c of CATEGORIES) {
    const existing = await prisma.kbCategory.findUnique({ where: { slug: c.slug } });
    if (existing) {
      map.set(c.slug, existing.id);
      continue;
    }
    const created = await prisma.kbCategory.create({
      data: {
        slug: c.slug,
        name: c.name,
        description: c.description,
        icon: c.icon,
        order: c.order,
      },
    });
    map.set(c.slug, created.id);
    console.log(`+ categoria '${c.name}'`);
  }
  return map;
}

async function ensureArticles(categoryMap) {
  for (const a of ARTICLES) {
    const existing = await prisma.kbArticle.findUnique({ where: { slug: a.slug } });
    if (existing) {
      console.log(`= articulo '${a.title}' (ya existe, saltado)`);
      continue;
    }
    await prisma.kbArticle.create({
      data: {
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        contentMd: a.contentMd,
        status: "publicado",
        tags: a.tags,
        categoryId: categoryMap.get(a.categorySlug) ?? null,
        publishedAt: new Date(),
      },
    });
    console.log(`+ articulo '${a.title}'`);
  }
}

const categoryMap = await ensureCategories();
await ensureArticles(categoryMap);

const finalCats = await prisma.kbCategory.count();
const finalArts = await prisma.kbArticle.count();
console.log(`\nEstado final: ${finalCats} categorias, ${finalArts} articulos.`);

await prisma.$disconnect();
