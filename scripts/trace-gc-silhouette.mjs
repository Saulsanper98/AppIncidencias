import sharp from "sharp";
import fs from "fs";

const src =
  "C:/Users/Incidencias/.cursor/projects/c-Users-Incidencias-AppIncidencias/assets/c__Users_Incidencias_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-04f57fc1-df00-47ef-b7ea-5eeeeb108383.png";

const TARGET_W = 720;
const { data, info } = await sharp(src)
  .ensureAlpha()
  .resize({ width: TARGET_W, fit: "inside" })
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = info.width;
const H = info.height;
const ch = info.channels;

const isLand = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const i = (y * W + x) * ch;
  const a = data[i + 3];
  const lum = data[i] + data[i + 1] + data[i + 2];
  // Silueta azul-gris opaca sobre transparente/negro
  return a > 128 && lum > 60;
};

const dirs = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function trace(sx, sy) {
  const path = [];
  let x = sx;
  let y = sy;
  let prevDir = 0;
  let guard = 0;
  do {
    path.push([x, y]);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const nd = (prevDir + 6 + k) % 8;
      const nx = x + dirs[nd][0];
      const ny = y + dirs[nd][1];
      if (isLand(nx, ny)) {
        x = nx;
        y = ny;
        prevDir = nd;
        found = true;
        break;
      }
    }
    if (!found) break;
    guard++;
    if (guard > W * H * 2) break;
  } while (!(x === sx && y === sy) || path.length < 8);
  return path;
}

const seen = new Uint8Array(W * H);
const comps = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const idx = y * W + x;
    if (seen[idx] || !isLand(x, y)) continue;
    const q = [[x, y]];
    seen[idx] = 1;
    let pixels = 0;
    let start = null;
    let minX = x;
    let maxX = x;
    let minY = y;
    let maxY = y;
    while (q.length) {
      const [cx, cy] = q.pop();
      pixels++;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      if (start === null && !isLand(cx - 1, cy)) start = [cx, cy];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (seen[ni] || !isLand(nx, ny)) continue;
        seen[ni] = 1;
        q.push([nx, ny]);
      }
    }
    if (start) comps.push({ pixels, start, minX, maxX, minY, maxY });
  }
}
comps.sort((a, b) => b.pixels - a.pixels);
console.log(
  "comps",
  comps.slice(0, 3).map((c) => ({ pixels: c.pixels, bbox: [c.minX, c.minY, c.maxX, c.maxY] })),
);
if (!comps[0]) {
  console.error("No land");
  process.exit(1);
}

const contour = trace(comps[0].start[0], comps[0].start[1]);
console.log("contour", contour.length);

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [x1, y1] = pts[0];
  const [x2, y2] = pts[pts.length - 1];
  let maxD = -1;
  let idx = 0;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const d = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const L = rdp(pts.slice(0, idx + 1), eps);
    const R = rdp(pts.slice(idx), eps);
    return L.slice(0, -1).concat(R);
  }
  return [pts[0], pts[pts.length - 1]];
}

// eps más bajo = más detalle en Isleta y costa
const simp = rdp(contour, 0.55);
console.log("simplified", simp.length);

const pad = 30;
const xs = simp.map((p) => p[0]);
const ys = simp.map((p) => p[1]);
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
const minY = Math.min(...ys);
const maxY = Math.max(...ys);
const bw = maxX - minX;
const bh = maxY - minY;
const VB_W = 600;
const VB_H = 640;
const scale = Math.min((VB_W - 2 * pad) / bw, (VB_H - 2 * pad) / bh);
const ox = (VB_W - bw * scale) / 2 - minX * scale;
const oy = (VB_H - bh * scale) / 2 - minY * scale;
const mapPt = (x, y) => [+(x * scale + ox).toFixed(1), +(y * scale + oy).toFixed(1)];
const mapped = simp.map(([x, y]) => mapPt(x, y));

let d = `M ${mapped[0][0]} ${mapped[0][1]}`;
for (let i = 1; i < mapped.length; i++) d += ` L ${mapped[i][0]} ${mapped[i][1]}`;
d += " Z";

/** Busca un punto de tierra cerca de un target relativo al bbox (con margen interior). */
function findLandNear(relX, relY, radiusPx = 28, minInterior = 6) {
  const tx = minX + bw * relX;
  const ty = minY + bh * relY;
  // Preferir pixels con vecinos tierra (más interior)
  let best = null;
  let bestScore = -1;
  for (let r = 0; r <= radiusPx; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r && r > 0) continue;
        const x = Math.round(tx + dx);
        const y = Math.round(ty + dy);
        if (!isLand(x, y)) continue;
        let interior = 0;
        for (const [ox2, oy2] of [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
          [4, 0],
          [-4, 0],
          [0, 4],
          [0, -4],
          [3, 3],
          [-3, 3],
          [3, -3],
          [-3, -3],
          [5, 5],
          [-5, 5],
          [5, -5],
          [-5, -5],
        ]) {
          if (isLand(x + ox2, y + oy2)) interior++;
        }
        if (interior < minInterior) continue;
        const score = interior * 12 - r * 2;
        if (score > bestScore) {
          bestScore = score;
          best = [x, y];
        }
      }
    }
    if (best && bestScore >= 80) break;
  }
  return best ? mapPt(best[0], best[1]) : mapPt(tx, ty);
}

// Targets NE más interiores (SW) para no caer al mar en 1366/1920.
const nodes = {
  neIsleta: findLandNear(0.72, 0.14, 48, 10),
  neLasPalmas: findLandNear(0.68, 0.26, 44, 10),
  surMaspalomas: findLandNear(0.52, 0.9, 30, 6),
  nwGaldar: findLandNear(0.28, 0.22, 30, 6),
  centro: findLandNear(0.48, 0.48, 24, 6),
  centroSur: findLandNear(0.55, 0.58, 24, 6),
};

const out = {
  viewBox: "0 0 600 640",
  path: d,
  points: mapped.length,
  nodes,
};
fs.writeFileSync("scripts/_gc-silhouette.json", JSON.stringify(out, null, 2));
console.log("nodes", nodes);
console.log("wrote", d.length, "chars", mapped.length, "pts");
