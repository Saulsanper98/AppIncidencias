/**
 * Tests de la heurística de urgencia de desvíos.
 *
 * Ejecutar: `npm run test:desvios:urgencia`
 */

import { strict as assert } from "node:assert";

import { calcularUrgencia } from "../src/lib/desvios/urgencia";

// Múltiples líneas → siempre alta.
assert.equal(
  calcularUrgencia({
    lineas_afectadas: ["1", "2"],
    fecha_inicio: "2026-06-23T08:00:00.000Z",
    fecha_fin: "2026-06-23T09:00:00.000Z",
  }),
  "alta",
);

// Una línea, duración corta → normal.
assert.equal(
  calcularUrgencia({
    lineas_afectadas: ["1"],
    fecha_inicio: "2026-06-23T08:00:00.000Z",
    fecha_fin: "2026-06-23T10:00:00.000Z",
  }),
  "normal",
);

// Una línea, ≥6h solapando horario diurno canario → alta.
// 08:00–15:00 UTC ≈ 09:00–16:00 Canarias en verano.
assert.equal(
  calcularUrgencia({
    lineas_afectadas: ["1"],
    fecha_inicio: "2026-06-23T08:00:00.000Z",
    fecha_fin: "2026-06-23T15:00:00.000Z",
  }),
  "alta",
);

// ≥6h pero solo nocturno (22:00–04:00 canarias aprox.) → normal.
assert.equal(
  calcularUrgencia({
    lineas_afectadas: ["1"],
    fecha_inicio: "2026-06-23T21:00:00.000Z",
    fecha_fin: "2026-06-24T04:00:00.000Z",
  }),
  "normal",
);

console.log("test-desvios-urgencia: OK");
