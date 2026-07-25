import fs from "fs";

const j = JSON.parse(fs.readFileSync("scripts/_gc-silhouette.json", "utf8"));
const n = j.nodes;

const body = `/** Path vectorizado desde silueta de referencia de Gran Canaria (viewBox 0 0 600 640). */
export const GRAN_CANARIA_VIEWBOX = "0 0 600 640";

export const GRAN_CANARIA_SILHOUETTE_PATH =
  "${j.path}";

/** Nodos de red dentro de la silueta (coords viewBox; anclados a tierra interior). */
export const GRAN_CANARIA_ROUTE_NODES = {
  neIsleta: { x: ${n.neIsleta[0]}, y: ${n.neIsleta[1]}, pulse: true },
  neLasPalmas: { x: ${n.neLasPalmas[0]}, y: ${n.neLasPalmas[1]}, pulse: true },
  surMaspalomas: { x: ${n.surMaspalomas[0]}, y: ${n.surMaspalomas[1]}, pulse: false },
  nwGaldar: { x: ${n.nwGaldar[0]}, y: ${n.nwGaldar[1]}, pulse: false },
  centro: { x: ${n.centro[0]}, y: ${n.centro[1]}, pulse: false },
  centroSur: { x: ${n.centroSur[0]}, y: ${n.centroSur[1]}, pulse: false },
} as const;
`;

fs.writeFileSync("src/app/login/login-gc-silhouette.ts", body);
console.log("updated login-gc-silhouette.ts", j.points, "pts");
