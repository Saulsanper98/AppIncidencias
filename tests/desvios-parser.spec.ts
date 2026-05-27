/**
 * Tests unitarios del parser de "Circular Informativa".
 *
 * Reutilizamos Playwright como runner (es el unico que esta configurado en el
 * proyecto) pero los tests NO necesitan navegador ni servidor: son funciones
 * puras sobre el modulo `src/lib/desvios/parser`. Por eso ignoramos el flag
 * `--project=chromium` y usamos solo `test`/`expect`.
 *
 * Los casos cubren los 4 escenarios del enunciado del modulo:
 *   1. Circular nocturna multi-dia (Linea 303, GC-5, 22:00-06:00).
 *   2. Circular con varias lineas y sentido "IDA/VUELTA".
 *   3. Circular con hora de fin "previsiblemente".
 *   4. Texto que NO es una Circular Informativa (parser rechaza).
 */

import { expect, test } from "@playwright/test";

import {
  parsearCircularPDF,
  parsearCircularPDFTodosLosDias,
} from "../src/lib/desvios/parser";

// ---------- Helpers de fixture ---------------------------------------------

/**
 * Construye el texto plano tipico que `pdf-parse` extrae de un PDF de
 * Circular Informativa. Mantenemos saltos de linea y mayusculas para imitar
 * el output real.
 */
function buildCircularTexto(opts: {
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

// ---------- Tests ----------------------------------------------------------

test.describe("parsearCircularPDF", () => {
  test.describe.configure({ mode: "parallel" });

  test("caso 1: GC-5, linea 303, 22:00-06:00 nocturno entre 24 y 25 de mayo 2026 (2 registros, cruza medianoche)", () => {
    const texto = buildCircularTexto({
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

    expect(result).toHaveLength(2);

    // Primer dia: 24 mayo 22:00 → 25 mayo 06:00.
    const r0 = result[0];
    expect(r0.fecha_inicio.getFullYear()).toBe(2026);
    expect(r0.fecha_inicio.getMonth()).toBe(4); // mayo = 4
    expect(r0.fecha_inicio.getDate()).toBe(24);
    expect(r0.fecha_inicio.getHours()).toBe(22);
    expect(r0.fecha_inicio.getMinutes()).toBe(0);
    expect(r0.fecha_fin.getDate()).toBe(25);
    expect(r0.fecha_fin.getHours()).toBe(6);

    // Segundo dia: 25 mayo 22:00 → 26 mayo 06:00.
    const r1 = result[1];
    expect(r1.fecha_inicio.getDate()).toBe(25);
    expect(r1.fecha_inicio.getHours()).toBe(22);
    expect(r1.fecha_fin.getDate()).toBe(26);
    expect(r1.fecha_fin.getHours()).toBe(6);

    expect(r0.lineas_afectadas).toEqual(["303"]);
    expect(r0.sentido).toBe("VUELTA");
    expect(r0.via.startsWith("GC-5")).toBe(true);
    expect(r0.referencia).toBe("(PROD) 23052026 1140");
    expect(r0.entorno).toBe("PRODUCCION");
    expect(r0.hora_fin_estimada).toBe(false);
    expect(r0.motivo).toBe("Asfaltado");
  });

  test("caso 2: Av. Las Tirajanas, lineas 19-36, IDA/VUELTA → lineas=['19','36'] y sentido=AMBOS", () => {
    const texto = buildCircularTexto({
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

    const result = parsearCircularPDFTodosLosDias(texto);
    expect(result).toHaveLength(1);
    const r = result[0];
    expect(r.lineas_afectadas).toEqual(["19", "36"]);
    expect(r.sentido).toBe("AMBOS");
    expect(r.fecha_inicio.getDate()).toBe(24);
    expect(r.fecha_inicio.getHours()).toBe(9);
    expect(r.fecha_fin.getDate()).toBe(24);
    expect(r.fecha_fin.getHours()).toBe(14);
    expect(r.via).toContain("AV");
  });

  test("caso 3: hora_fin con 'previsiblemente' → hora_fin_estimada = true", () => {
    const texto = buildCircularTexto({
      referencia: "(PROD) 18052026 0830",
      entorno: "PRODUCCION",
      titulo:
        "CIERRE AL TRAFICO GC-1 / LOMO DE LA POSADA / LUNES DIA 18 MAYO 2026",
      horario: "desde las 08:00 y previsiblemente hasta las 13:00 horas",
      tramo: "Lomo de la Posada km 14",
      motivo: "Trabajos de mantenimiento",
      lineas: "1",
      sentido: "IDA",
    });

    const result = parsearCircularPDF(texto);
    expect(result.hora_fin_estimada).toBe(true);
    expect(result.sentido).toBe("IDA");
    expect(result.fecha_inicio.getHours()).toBe(8);
    expect(result.fecha_fin.getHours()).toBe(13);
  });

  test("caso 4: texto que NO es una circular → parser lanza", () => {
    const basura =
      "Esto es un correo cualquiera sin referencia, sin titulo y sin horario.";
    expect(() => parsearCircularPDF(basura)).toThrow();
  });

  test("paradas: extrae nombre+codigo y desestima ruido", () => {
    const texto = buildCircularTexto({
      referencia: "(PROD) 19052026 1015",
      entorno: "PRODUCCION",
      titulo: "CIERRE AL TRAFICO GC-3 / GUIA / JUEVES DIA 28 MAYO 2026",
      horario: "desde las 09:00 y hasta las 18:00 horas",
      tramo: "Tramo X",
      motivo: "Asfaltado",
      lineas: "105",
      sentido: "Ambos",
      paradasFuera:
        "Parada Guia Centro (1234), Plaza del Pino (1235-2)",
      paradasAlt: "Parada Norte (9001), Parada Sur (9002)",
    });

    const r = parsearCircularPDF(texto);
    expect(r.paradas_fuera.length).toBeGreaterThanOrEqual(2);
    expect(r.paradas_fuera[0].nombre.toLowerCase()).toContain("guia centro");
    expect(r.paradas_fuera[0].codigo).toBe("1234");
    expect(r.paradas_fuera[1].codigo).toBe("1235-2");
    expect(r.paradas_alternativas).toHaveLength(2);
    expect(r.paradas_alternativas[0].nombre.toLowerCase()).toContain("parada norte");
    expect(r.paradas_alternativas[0].codigo).toBe("9001");
  });

  test("itinerario alternativo: extrae URL si esta presente", () => {
    const texto = buildCircularTexto({
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
    expect(r.url_itinerario).toBe("https://maps.example.com/itin/abc123");
  });
});
