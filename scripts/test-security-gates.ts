/**
 * Smoke de puertas de seguridad (Fase 0 auditoría).
 * Ejecutar: npx tsx scripts/test-security-gates.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { isDevUserSelectorEnabled } from "../src/lib/dev-auth";
import { isSafeUploadId, resolveSafeUploadsPath } from "../src/lib/safe-upload-path";
import { isSessionTokenShape } from "../src/lib/session-edge";

function section(name: string) {
  console.log(`\n== ${name} ==`);
}

section("session token shape");
assert.equal(isSessionTokenShape("v1.abc.def"), true);
assert.equal(isSessionTokenShape("garbage"), false);
assert.equal(isSessionTokenShape("v1.onlytwo"), false);
assert.equal(isSessionTokenShape(""), false);
assert.equal(isSessionTokenShape(null), false);

section("safe upload path");
assert.equal(isSafeUploadId("clxyz123"), true);
assert.equal(isSafeUploadId("../etc"), false);
assert.equal(isSafeUploadId("a/b"), false);
assert.equal(resolveSafeUploadsPath(["..", "etc"]), null);
assert.ok(resolveSafeUploadsPath(["tickets", "id1", "a.jpg"]));

section("dev login selector never in production");
{
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/dev-auth.ts"), "utf8");
  assert.match(src, /NODE_ENV === ["']production["']/);
  assert.match(src, /return false/);
  process.env.NEXT_PUBLIC_DEV_LOGIN_SELECTOR = "0";
  assert.equal(isDevUserSelectorEnabled(), false);
  delete process.env.NEXT_PUBLIC_DEV_LOGIN_SELECTOR;
}

console.log("\nOK security gates");
