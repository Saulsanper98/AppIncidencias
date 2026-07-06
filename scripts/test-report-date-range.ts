/**
 * Tests de rangos de fecha para reportes operativos.
 *
 * Ejecutar: `npm run test:report-date-range`
 */

import { strict as assert } from "node:assert";

import {
  dayKeyUtc,
  parseDateOnlyUtc,
  resolveOperationalReportRange,
} from "../src/lib/report-date-range";

assert.equal(parseDateOnlyUtc("2026-06-23")?.toISOString(), "2026-06-23T00:00:00.000Z");
assert.equal(parseDateOnlyUtc("bad"), null);

const last7 = resolveOperationalReportRange(new URLSearchParams("range=last7"));
assert.equal(last7.preset, "last7");
assert.equal(last7.label, "Últimos 7 días");
assert.ok(last7.since <= last7.until);

const custom = resolveOperationalReportRange(
  new URLSearchParams("from=2026-06-01&to=2026-06-15"),
);
assert.equal(custom.preset, "custom");
assert.equal(custom.label, "2026-06-01 → 2026-06-15");

const days = resolveOperationalReportRange(new URLSearchParams("days=30"));
assert.equal(days.preset, "last30");

assert.equal(dayKeyUtc(new Date("2026-06-23T15:30:00.000Z")), "2026-06-23");

console.log("test-report-date-range: OK");
