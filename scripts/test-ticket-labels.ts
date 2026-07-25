/**
 * Tests de etiquetas canónicas de tickets.
 *
 * Ejecutar: `npm run test:ticket-labels`
 */

import { strict as assert } from "node:assert";

import type { TicketPriority, TicketStatus } from "../src/lib/domain";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "../src/lib/ticket-labels";
import { statusMap } from "../src/components/tickets/tickets-module-types";

const ALL_STATUSES: TicketStatus[] = [
  "borrador",
  "abierto",
  "en_proceso",
  "esperando_repuesto",
  "resuelto",
];

const ALL_PRIORITIES: TicketPriority[] = ["alta", "media", "baja"];

for (const status of ALL_STATUSES) {
  assert.ok(TICKET_STATUS_LABELS[status], `falta etiqueta para ${status}`);
  assert.equal(statusMap[status], TICKET_STATUS_LABELS[status]);
}

for (const priority of ALL_PRIORITIES) {
  assert.ok(TICKET_PRIORITY_LABELS[priority], `falta etiqueta para ${priority}`);
}

console.log("test-ticket-labels: OK");
