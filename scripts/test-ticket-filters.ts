/**
 * Smoke tests de filtros de tickets compartidos entre APIs.
 *
 * Ejecutar: `npm run test:ticket-filters`
 */

import { strict as assert } from "node:assert";

import {
  normalizeTicketPriorityFilter,
  normalizeTicketStatusFilter,
} from "../src/lib/ticket-filters";

assert.equal(normalizeTicketStatusFilter(null), "todos");
assert.equal(normalizeTicketStatusFilter("todos"), "todos");
assert.equal(normalizeTicketStatusFilter("borrador"), "borrador");
assert.equal(normalizeTicketStatusFilter("borrador", { includeBorrador: false }), "todos");
assert.equal(normalizeTicketStatusFilter("abierto"), "abierto");
assert.equal(normalizeTicketStatusFilter("invalido"), "todos");

assert.equal(normalizeTicketPriorityFilter(null), "todos");
assert.equal(normalizeTicketPriorityFilter("alta"), "alta");
assert.equal(normalizeTicketPriorityFilter("urgente"), "todos");

console.log("test-ticket-filters: OK");
