import fs from "node:fs";
import path from "node:path";

const cssPath = path.resolve(process.cwd(), "src/app/globals.css");
const css = fs.readFileSync(cssPath, "utf8");

const wanted = ["--color-surface", "--color-text-1", "--color-text-2", "--color-text-3"];
const values = {};
for (const token of wanted) {
  const m = css.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`No se encontró ${token} en globals.css`);
  values[token] = m[1];
}

function hexToRgb(hex) {
  const n = hex.replace("#", "");
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function luma([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function ratio(a, b) {
  const [L1, L2] = [luma(hexToRgb(a)), luma(hexToRgb(b))].sort((x, y) => y - x);
  return (L1 + 0.05) / (L2 + 0.05);
}

const bg = values["--color-surface"];
const checks = [
  ["--color-text-1", 4.5],
  ["--color-text-2", 4.5],
  ["--color-text-3", 4.5],
];

let ok = true;
for (const [token, min] of checks) {
  const r = ratio(values[token], bg);
  const pass = r >= min;
  if (!pass) ok = false;
  console.log(`${pass ? "PASS" : "FAIL"} ${token} vs --color-surface = ${r.toFixed(2)} (min ${min})`);
}

if (!ok) process.exit(1);
