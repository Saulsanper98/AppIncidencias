/**
 * Smoke tests de permisos del subsistema de desvíos.
 *
 * Ejecutar: `npm run test:desvios:rbac`
 */

import { strict as assert } from "node:assert";

import {
  canControlDesviosPoller,
  canDeleteDesvio,
  canManageDesvios,
  canReadDesvios,
} from "../src/lib/rbac";

assert.equal(canReadDesvios("conductor"), true);
assert.equal(canManageDesvios("conductor"), false);
assert.equal(canManageDesvios("tecnico_campo"), true);
assert.equal(canDeleteDesvio("tecnico_campo"), false);
assert.equal(canDeleteDesvio("gestor_centro_control"), true);
assert.equal(canControlDesviosPoller("gestor_centro_control"), true);
assert.equal(canControlDesviosPoller("tecnico_campo"), false);

console.log("test-desvios-rbac: OK");
