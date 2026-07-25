/**
 * Tests de utilidades matemáticas de analytics.
 *
 * Ejecutar: `npm run test:analytics-math`
 */

import { strict as assert } from "node:assert";

import { median, ticketPrioritySortOrder } from "../src/lib/analytics-math";

assert.equal(median([]), 0);
assert.equal(median([5]), 5);
assert.equal(median([1, 3, 5, 7]), 4);
assert.equal(median([1, 2, 3, 4]), 3);

assert.equal(ticketPrioritySortOrder("critica"), 0);
assert.equal(ticketPrioritySortOrder("alta"), 1);
assert.equal(ticketPrioritySortOrder("media"), 2);
assert.equal(ticketPrioritySortOrder("baja"), 3);
assert.equal(ticketPrioritySortOrder("unknown"), 4);
assert.ok(ticketPrioritySortOrder("alta") < ticketPrioritySortOrder("baja"));

console.log("test-analytics-math: OK");
