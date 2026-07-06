/**
 * Tests unitarios de reglas de prioridad y SLA en ticketing.
 *
 * Ejecutar: `npm run test:ticketing`
 */

import { strict as assert } from "node:assert";

import {
  addMinutesIso,
  calculatePriority,
  calculateSlaMinutes,
  DEFAULT_SLA_MINUTES,
  formatSlaOverdueLabel,
  toUiPriority,
} from "../src/lib/ticketing";

// --- calculatePriority: nivelImpacto tiene precedencia ---

assert.equal(
  calculatePriority({ assetType: "validadora", impactedLines: 0, serviceStopped: false, nivelImpacto: "Alto" }),
  "alta",
);
assert.equal(
  calculatePriority({ assetType: "validadora", impactedLines: 0, serviceStopped: false, nivelImpacto: "Medio" }),
  "media",
);
assert.equal(
  calculatePriority({ assetType: "validadora", impactedLines: 0, serviceStopped: false, nivelImpacto: "Bajo" }),
  "baja",
);

// Edge: nivelImpacto=Medio ignora serviceStopped (regla explícita del negocio).
assert.equal(
  calculatePriority({ assetType: "validadora", impactedLines: 5, serviceStopped: true, nivelImpacto: "Medio" }),
  "media",
);

// --- calculatePriority: sin nivelImpacto ---

assert.equal(
  calculatePriority({ assetType: "validadora", impactedLines: 0, serviceStopped: true }),
  "alta",
);
assert.equal(
  calculatePriority({ assetType: "validadora", impactedLines: 3, serviceStopped: false }),
  "alta",
);
assert.equal(
  calculatePriority({ assetType: "sae", impactedLines: 0, serviceStopped: false }),
  "media",
);
assert.equal(
  calculatePriority({ assetType: "router", impactedLines: 0, serviceStopped: false }),
  "media",
);
assert.equal(
  calculatePriority({ assetType: "validadora", impactedLines: 2, serviceStopped: false }),
  "media",
);
assert.equal(
  calculatePriority({ assetType: "validadora", impactedLines: 1, serviceStopped: false }),
  "baja",
);

// --- SLA y utilidades ---

assert.equal(calculateSlaMinutes("alta"), DEFAULT_SLA_MINUTES.alta);
assert.equal(calculateSlaMinutes("media", { media: 90 }), 90);
assert.equal(calculateSlaMinutes("baja", { alta: 10 }), DEFAULT_SLA_MINUTES.baja);

assert.equal(toUiPriority("alta"), "Alta");
assert.equal(toUiPriority("media"), "Media");
assert.equal(toUiPriority("baja"), "Baja");

assert.equal(formatSlaOverdueLabel(-45), "45 min");
assert.equal(formatSlaOverdueLabel(-90), "1 h 30 min");
assert.equal(formatSlaOverdueLabel(-120), "2 h");

const base = new Date("2024-06-01T12:00:00.000Z");
assert.equal(addMinutesIso(base, 30), "2024-06-01T12:30:00.000Z");

console.log("test-ticketing: OK");
