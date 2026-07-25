/**
 * Detecta texto corrupto (mojibake) típico de UTF-8 mal interpretado.
 * Ejecutar: `node scripts/check-utf8-mojibake.mjs`
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["src", "tests", "scripts"];
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".md", ".json"]);
const MOJIBAKE = /┬À|├í|├æ|ÔÇª|┠|┕|├¡|├│|├║|├®|ÔåÆ|ÔÇö|┬┐|Ã¡|Ã©|Ã­|Ã³|Ãº|Ã±/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (EXT.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const hits = [];
for (const dir of SCAN_DIRS) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) continue;
  for (const file of walk(base)) {
    const text = fs.readFileSync(file, "utf8");
    if (MOJIBAKE.test(text)) hits.push(path.relative(ROOT, file));
  }
}

if (hits.length) {
  console.error("Mojibake detectado en:");
  for (const f of hits) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("check-utf8-mojibake: OK");
