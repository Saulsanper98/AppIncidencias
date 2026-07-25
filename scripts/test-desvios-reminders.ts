/**
 * Tests de la lógica de recordatorios de desvíos (ventana de 10 min).
 *
 * Ejecutar: `npm run test:desvios:reminders`
 */

import { strict as assert } from "node:assert";

import {
  DESVIO_REMINDER_MS,
  needsDesvioEndReminder,
  needsDesvioStartReminder,
  pickDueDesvioReminder,
  reminderEventMs,
  type DesvioReminderItem,
} from "../src/lib/desvios/reminder-logic";
import type { DesvioResumen } from "../src/lib/desvios/types";

function makeDesvio(overrides: Partial<DesvioResumen> = {}): DesvioResumen {
  return {
    id: "d1",
    referencia: "REF-1",
    titulo: "Desvío prueba",
    via: "GC-1",
    tramo: "A-B",
    fecha_inicio: "2026-06-23T10:00:00.000Z",
    fecha_fin: "2026-06-23T12:00:00.000Z",
    hora_fin_estimada: false,
    sin_fecha_fin: false,
    motivo: "Obras",
    sentido: "IDA",
    lineas_afectadas: ["1"],
    estado: "PENDIENTE",
    origen: "MANUAL",
    url_itinerario: null,
    pdf_path: null,
    creado_en: "2026-06-23T09:00:00.000Z",
    actualizado_en: "2026-06-23T09:00:00.000Z",
    confirmado_por: null,
    confirmado_en: null,
    ...overrides,
  };
}

const startMs = new Date("2026-06-23T10:00:00.000Z").getTime();
const endMs = new Date("2026-06-23T12:00:00.000Z").getTime();

// --- needsDesvioStartReminder ---

assert.equal(needsDesvioStartReminder(makeDesvio(), startMs - DESVIO_REMINDER_MS - 1), false);
assert.equal(needsDesvioStartReminder(makeDesvio(), startMs - DESVIO_REMINDER_MS), true);
assert.equal(needsDesvioStartReminder(makeDesvio({ estado: "ACTIVO" }), startMs), false);
assert.equal(needsDesvioStartReminder(makeDesvio({ fecha_inicio: "invalid" }), startMs), false);

// --- needsDesvioEndReminder ---

assert.equal(
  needsDesvioEndReminder(makeDesvio({ estado: "ACTIVO" }), endMs - DESVIO_REMINDER_MS - 1),
  false,
);
assert.equal(
  needsDesvioEndReminder(makeDesvio({ estado: "ACTIVO" }), endMs - DESVIO_REMINDER_MS),
  true,
);
assert.equal(
  needsDesvioEndReminder(makeDesvio({ estado: "ACTIVO", sin_fecha_fin: true }), endMs),
  false,
);
assert.equal(needsDesvioEndReminder(makeDesvio({ estado: "PENDIENTE" }), endMs), false);

// --- reminderEventMs ---

const startItem: DesvioReminderItem = { kind: "start", desvio: makeDesvio() };
const endItem: DesvioReminderItem = { kind: "end", desvio: makeDesvio({ estado: "ACTIVO" }) };
assert.equal(reminderEventMs(startItem), startMs);
assert.equal(reminderEventMs(endItem), endMs);

// --- pickDueDesvioReminder ---

const due: DesvioReminderItem[] = [
  {
    kind: "start",
    desvio: makeDesvio({ id: "later", fecha_inicio: "2026-06-23T10:00:00.000Z" }),
  },
  {
    kind: "start",
    desvio: makeDesvio({ id: "sooner", fecha_inicio: "2026-06-23T09:55:00.000Z" }),
  },
];
const now = new Date("2026-06-23T09:50:00.000Z").getTime();
const picked = pickDueDesvioReminder(due, new Set(), now);
assert.ok(picked);
assert.equal(picked!.desvio.id, "sooner");

const dismissed = pickDueDesvioReminder(due, new Set(["start:sooner"]), now);
assert.ok(dismissed);
assert.equal(dismissed!.desvio.id, "later");

console.log("test-desvios-reminders: OK");
