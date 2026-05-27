/**
 * Smoke tests del parser de Desvios.
 *
 * Se ejecutan con `npx tsx scripts/test-desvios-parser.ts` y NO requieren
 * arrancar Next ni Playwright. Cubren los 4 casos del enunciado del modulo
 * de Desvios (y un par de extras de paradas / itinerario).
 *
 * Salida:
 *   - Exit 0 si todos pasan.
 *   - Exit 1 si alguno falla, con detalle del caso fallido.
 */

import { strict as assert } from "node:assert";

import { canaryParts } from "../src/lib/datetime/canary";
import {
  parsearCircularPDF,
  parsearCircularPDFTodosLosDias,
} from "../src/lib/desvios/parser";

// Los Date que devuelve el parser representan horas en Atlantic/Canary
// (independientemente de la TZ del proceso). Los tests deben leer los
// componentes en TZ Canary para que pasen aunque corras `tsx` en Madrid o
// en un CI con TZ UTC.
function cp(d: Date) {
  return canaryParts(d);
}

function buildCircular(opts: {
  referencia: string;
  entorno: string;
  titulo: string;
  horario: string;
  tramo: string;
  motivo: string;
  lineas: string;
  sentido: string;
  itinerario?: string;
  paradasFuera?: string;
  paradasAlt?: string;
}): string {
  const lines = [
    opts.referencia,
    opts.entorno,
    "",
    opts.titulo,
    "",
    `Horario del cierre: ${opts.horario}`,
    `Tramo que comprende el cierre: ${opts.tramo}`,
    `Motivo: ${opts.motivo}`,
    `Lineas afectadas: ${opts.lineas}`,
    `Sentido afectado: ${opts.sentido}`,
  ];
  if (opts.itinerario) lines.push(`Itinerario alternativo: ${opts.itinerario}`);
  if (opts.paradasFuera) lines.push(`Paradas fuera de servicio: ${opts.paradasFuera}`);
  if (opts.paradasAlt) lines.push(`Paradas alternativas: ${opts.paradasAlt}`);
  return lines.join("\n");
}

type TestCase = { name: string; run: () => void };

const cases: TestCase[] = [
  {
    name: "1. Multi-dia nocturno GC-5, linea 303, 22:00-06:00",
    run: () => {
      const texto = buildCircular({
        referencia: "(PROD) 23052026 1140",
        entorno: "PRODUCCION",
        titulo:
          "CIERRE AL TRAFICO GC-5 / GLORIETA DEL BATAN-RAFAEL CABRERA / DOMINGO 24 Y LUNES 25 DE MAYO DE 2026",
        horario: "desde las 22:00 y hasta las 06:00 horas",
        tramo: "Glorieta del Batan al cruce con Rafael Cabrera",
        motivo: "Asfaltado",
        lineas: "303",
        sentido: "VUELTA",
      });
      const result = parsearCircularPDFTodosLosDias(texto);
      assert.equal(result.length, 2, "Deben generarse 2 dias");
      const [r0, r1] = result;
      assert.equal(cp(r0.fecha_inicio).year, 2026);
      assert.equal(cp(r0.fecha_inicio).month, 5); // mayo (1-indexed)
      assert.equal(cp(r0.fecha_inicio).day, 24);
      assert.equal(cp(r0.fecha_inicio).hour, 22);
      assert.equal(cp(r0.fecha_fin).day, 25);
      assert.equal(cp(r0.fecha_fin).hour, 6);
      assert.equal(cp(r1.fecha_inicio).day, 25);
      assert.equal(cp(r1.fecha_inicio).hour, 22);
      assert.equal(cp(r1.fecha_fin).day, 26);
      assert.equal(cp(r1.fecha_fin).hour, 6);
      assert.deepEqual(r0.lineas_afectadas, ["303"]);
      assert.equal(r0.sentido, "VUELTA");
      assert.ok(r0.via.startsWith("GC-5"), `via=${r0.via}`);
      assert.equal(r0.referencia, "(PROD) 23052026 1140");
      assert.equal(r0.hora_fin_estimada, false);
      assert.equal(r0.motivo, "Asfaltado");
    },
  },
  {
    name: "2. Av. Las Tirajanas, lineas 19-36, IDA/VUELTA → sentido AMBOS",
    run: () => {
      const texto = buildCircular({
        referencia: "(PROD) 22052026 0930",
        entorno: "PRODUCCION",
        titulo:
          "CIERRE TEMPORAL AL TRAFICO / AV. LAS TIRAJANAS, VECINDARIO / DOMINGO DIA 24 MAYO 2026",
        horario: "desde las 09:00 y hasta las 14:00 horas",
        tramo: "Av. Las Tirajanas desde la rotonda hasta la calle X",
        motivo: "Prueba ciclista",
        lineas: "19-36",
        sentido: "IDA/VUELTA",
      });
      const r = parsearCircularPDF(texto);
      assert.deepEqual(r.lineas_afectadas, ["19", "36"]);
      assert.equal(r.sentido, "AMBOS");
      assert.equal(cp(r.fecha_inicio).day, 24);
      assert.equal(cp(r.fecha_inicio).hour, 9);
      assert.equal(cp(r.fecha_fin).day, 24);
      assert.equal(cp(r.fecha_fin).hour, 14);
      assert.ok(r.via.toUpperCase().includes("AV"), `via=${r.via}`);
    },
  },
  {
    name: "3. 'previsiblemente' → hora_fin_estimada = true",
    run: () => {
      const texto = buildCircular({
        referencia: "(PROD) 18052026 0830",
        entorno: "PRODUCCION",
        titulo: "CIERRE AL TRAFICO GC-1 / LOMO DE LA POSADA / LUNES DIA 18 MAYO 2026",
        horario: "desde las 08:00 y previsiblemente hasta las 13:00 horas",
        tramo: "Lomo de la Posada km 14",
        motivo: "Trabajos de mantenimiento",
        lineas: "1",
        sentido: "IDA",
      });
      const r = parsearCircularPDF(texto);
      assert.equal(r.hora_fin_estimada, true);
      assert.equal(r.sentido, "IDA");
      assert.equal(cp(r.fecha_inicio).hour, 8);
      assert.equal(cp(r.fecha_fin).hour, 13);
    },
  },
  {
    name: "4. Texto que NO es circular → lanza",
    run: () => {
      assert.throws(() => parsearCircularPDF("hola mundo, esto no es una circular"));
    },
  },
  {
    name: "5. Paradas con codigo simple y compuesto (1234, 1235-2)",
    run: () => {
      const texto = buildCircular({
        referencia: "(PROD) 19052026 1015",
        entorno: "PRODUCCION",
        titulo: "CIERRE AL TRAFICO GC-3 / GUIA / JUEVES DIA 28 MAYO 2026",
        horario: "desde las 09:00 y hasta las 18:00 horas",
        tramo: "Tramo X",
        motivo: "Asfaltado",
        lineas: "105",
        sentido: "Ambos",
        paradasFuera: "Parada Guia Centro (1234), Plaza del Pino (1235-2)",
        paradasAlt: "Parada Norte (9001), Parada Sur (9002)",
      });
      const r = parsearCircularPDF(texto);
      assert.ok(r.paradas_fuera.length >= 2, `paradas fuera=${r.paradas_fuera.length}`);
      assert.equal(r.paradas_fuera[0].codigo, "1234");
      assert.equal(r.paradas_fuera[1].codigo, "1235-2");
      assert.equal(r.paradas_alternativas.length, 2);
      assert.equal(r.paradas_alternativas[0].codigo, "9001");
      assert.equal(r.paradas_alternativas[1].codigo, "9002");
    },
  },
  {
    name: "7. Infografia OCR sin referencia (PROD): genera referencia sintetica",
    run: () => {
      // Reproduce el texto que sale del OCR de una nueva infografia: el
      // contenido viene partido en imagenes, separadas con "\n\n". No hay
      // cabecera "(PROD) ddmmyyyy hhmm", el horario aparece como linea
      // suelta, y la etiqueta "Linea afectada" pierde la "L" inicial.
      const texto = [
        "CIRCULAR Informativa",
        "",
        "CIERRE AL TRAFICO",
        "",
        "GLORIETA DEL BATAN",
        "",
        "RAFAEL CABRERA",
        "",
        "DOMINGO 24 Y LUNES 25 DE MAYO",
        "",
        "DE 2026",
        "",
        "del cierre de la via:",
        "",
        "desde las 22:00 y hasta las 06",
        "",
        "Tramo que comprende el cierre:",
        "",
        "Glorieta del Batan y enlace de C/ Obispo Codina hasta",
        "",
        "Rafael Cabrera",
        "",
        "inea afectada",
        "",
        "303",
        "",
        "Itinerarios alternativos:",
        "",
        "(PULSE EL LINK):",
        "",
        "PULSE EL LINK PARA VER ITINERARIO ALTERNATIVO",
        "",
        "fuera de Servicio:",
        "",
        "San Roque (151052), C.P. San Juan Bosco (151062),",
        "",
        "Paradas alternativas:",
        "",
        "La Tropical (151032), Teatro Perez Galdos (1082)",
      ].join("\n");
      const result = parsearCircularPDFTodosLosDias(texto);
      assert.equal(result.length, 2, `Deben generarse 2 dias, got ${result.length}`);
      const [r0, r1] = result;
      assert.equal(cp(r0.fecha_inicio).day, 24);
      assert.equal(cp(r0.fecha_inicio).hour, 22);
      assert.equal(cp(r0.fecha_fin).hour, 6);
      assert.equal(cp(r1.fecha_inicio).day, 25);
      assert.ok(
        r0.referencia.startsWith("(MANUAL)"),
        `Referencia debe ser sintetica, got ${r0.referencia}`,
      );
      assert.equal(r0.lineas_afectadas[0], "303", `lineas=${r0.lineas_afectadas.join(",")}`);
      assert.ok(
        r0.via.includes("GLORIETA"),
        `via debe contener GLORIETA, got ${r0.via}`,
      );
      // Mismo PDF subido dos veces debe generar misma referencia (determinista).
      const result2 = parsearCircularPDFTodosLosDias(texto);
      assert.equal(result2[0].referencia, r0.referencia);
    },
  },
  {
    name: "6. Itinerario alternativo: extrae URL",
    run: () => {
      const texto = buildCircular({
        referencia: "(PROD) 20052026 1500",
        entorno: "PRODUCCION",
        titulo: "CIERRE AL TRAFICO GC-1 / MARTES DIA 20 MAYO 2026",
        horario: "desde las 06:00 y hasta las 14:00 horas",
        tramo: "Tramo X",
        motivo: "Asfaltado",
        lineas: "1",
        sentido: "AMBOS",
        itinerario: "https://maps.example.com/itin/abc123",
      });
      const r = parsearCircularPDF(texto);
      assert.equal(r.url_itinerario, "https://maps.example.com/itin/abc123");
    },
  },
];

let pass = 0;
const failures: { name: string; error: unknown }[] = [];
for (const tc of cases) {
  try {
    tc.run();
    console.log(`  OK  ${tc.name}`);
    pass++;
  } catch (err) {
    console.log(`  FAIL ${tc.name}`);
    if (err instanceof Error) console.log(`       ${err.message}`);
    failures.push({ name: tc.name, error: err });
  }
}

console.log("");
console.log(`${pass}/${cases.length} pasados.`);
if (failures.length > 0) {
  console.error("Fallos:");
  for (const f of failures) {
    console.error(`  - ${f.name}`);
  }
  process.exit(1);
}
