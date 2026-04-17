import type { TicketPriority, TicketStatus } from "@/lib/domain";

/** Límite suave de la isla (sur-oeste, norte-este) en WGS84. */
export const GRAN_CANARIA_BOUNDS: [[number, number], [number, number]] = [
  [27.72, -15.92],
  [28.18, -15.35],
];

export const GRAN_CANARIA_CENTER: [number, number] = [27.95, -15.58];

const GC_LAT_MIN = GRAN_CANARIA_BOUNDS[0][0];
const GC_LAT_MAX = GRAN_CANARIA_BOUNDS[1][0];
const GC_LNG_MIN = GRAN_CANARIA_BOUNDS[0][1];
const GC_LNG_MAX = GRAN_CANARIA_BOUNDS[1][1];

/** Comprueba si un punto WGS84 cae dentro del rectángulo aproximado de Gran Canaria. */
export function isWithinGranCanariaBounds(lat: number, lng: number): boolean {
  return lat >= GC_LAT_MIN && lat <= GC_LAT_MAX && lng >= GC_LNG_MIN && lng <= GC_LNG_MAX;
}

/** Distancia en km entre dos puntos WGS84 (fórmula haversine). */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

type MunicipioKey = string;

/** Centros aproximados por municipio (orden operativo / catálogo semilla). */
const MUNICIPIO_COORDS: Record<MunicipioKey, [number, number]> = {
  "Las Palmas de Gran Canaria": [28.1236, -15.4366],
  Telde: [27.9925, -15.4192],
  Maspalomas: [27.7606, -15.586],
  Arucas: [28.1198, -15.5233],
  Ingenio: [27.9209, -15.4406],
  Agüimes: [27.8789, -15.4461],
  "Santa Lucía de Tirajana": [27.9115, -15.5407],
  "San Bartolomé de Tirajana": [27.9242, -15.573],
  Gáldar: [28.1446, -15.6502],
  Vecindario: [27.8463, -15.4451],
};

const MUNICIPIO_ALIASES: Record<string, MunicipioKey> = {
  "las palmas gc": "Las Palmas de Gran Canaria",
  "las palmas": "Las Palmas de Gran Canaria",
  "las palmas de gran canaria": "Las Palmas de Gran Canaria",
  telde: "Telde",
  maspalomas: "Maspalomas",
  arucas: "Arucas",
  ingenio: "Ingenio",
  "agüimes": "Agüimes",
  "santa lucia de tirajana": "Santa Lucía de Tirajana",
  "santa lucía de tirajana": "Santa Lucía de Tirajana",
  "san bartolome de tirajana": "San Bartolomé de Tirajana",
  "san bartolomé de tirajana": "San Bartolomé de Tirajana",
  galdar: "Gáldar",
  "gáldar": "Gáldar",
  vecindario: "Vecindario",
};

export function normalizeMunicipioLabel(raw: string): MunicipioKey {
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (MUNICIPIO_ALIASES[lower]) return MUNICIPIO_ALIASES[lower];
  if (MUNICIPIO_COORDS[t]) return t;
  return t;
}

export function resolveMunicipioCoordinates(municipio: string): [number, number] {
  const key = normalizeMunicipioLabel(municipio);
  const c = MUNICIPIO_COORDS[key];
  if (c) return c;
  return GRAN_CANARIA_CENTER;
}

export type MapTicketInput = {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  municipio: string;
  busId: string;
  operator: string;
  slaDeadline: string;
  /** ISO 8601; usado para orden «por creación» en el mapa. */
  createdAt?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type MapTicketFeature = MapTicketInput & {
  lat: number;
  lng: number;
  /** True si la posición viene de GPS del ticket; false si es jitter sobre municipio. */
  positionFromGps: boolean;
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Separa visualmente varios tickets en el mismo municipio (sin GPS). */
function jitterLatLng(id: string, indexInGroup: number, baseLat: number, baseLng: number): { lat: number; lng: number } {
  const h = hashString(id);
  const angle = ((h % 360) * Math.PI) / 180;
  const radius = 0.0018 + (indexInGroup % 6) * 0.00042;
  return {
    lat: baseLat + Math.sin(angle) * radius,
    lng: baseLng + Math.cos(angle) * radius,
  };
}

/** Micro-desplazamiento si hay coordenadas reales coincidentes. */
function microJitterGps(id: string, lat: number, lng: number): { lat: number; lng: number } {
  const h = hashString(id);
  const dLat = ((h % 200) - 100) * 1e-6;
  const dLng = (((h >> 8) % 200) - 100) * 1e-6;
  return { lat: lat + dLat, lng: lng + dLng };
}

export function buildMapTicketFeatures(tickets: MapTicketInput[]): MapTicketFeature[] {
  const withGps = tickets.filter(
    (t) => typeof t.latitude === "number" && typeof t.longitude === "number" && Number.isFinite(t.latitude) && Number.isFinite(t.longitude),
  );
  const withoutGps = tickets.filter(
    (t) => !(typeof t.latitude === "number" && typeof t.longitude === "number" && Number.isFinite(t.latitude) && Number.isFinite(t.longitude)),
  );

  const gpsFeatures: MapTicketFeature[] = withGps.map((t) => {
    const { lat, lng } = microJitterGps(t.id, t.latitude as number, t.longitude as number);
    return {
      ...t,
      municipio: normalizeMunicipioLabel(t.municipio),
      lat,
      lng,
      positionFromGps: true,
    };
  });

  const byMuni = new Map<string, MapTicketInput[]>();
  for (const t of withoutGps) {
    const k = normalizeMunicipioLabel(t.municipio);
    const arr = byMuni.get(k) ?? [];
    arr.push(t);
    byMuni.set(k, arr);
  }
  const muniFeatures: MapTicketFeature[] = [];
  for (const [, group] of byMuni) {
    /** Orden estable por id para que el índice de jitter no cambie al refrescar la API. */
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((t, idx) => {
      const [baseLat, baseLng] = resolveMunicipioCoordinates(t.municipio);
      const { lat, lng } = jitterLatLng(t.id, idx, baseLat, baseLng);
      muniFeatures.push({
        ...t,
        municipio: normalizeMunicipioLabel(t.municipio),
        lat,
        lng,
        positionFromGps: false,
      });
    });
  }

  return [...gpsFeatures, ...muniFeatures];
}

/** Colores hex para Leaflet (no resuelve `var(--css)` en canvas). Alineados con el tema oscuro CCMGC. */
export function statusMapMarkerColorHex(status: TicketStatus): string {
  switch (status) {
    case "abierto":
      return "#f87171";
    case "en_proceso":
      return "#fbbf24";
    case "esperando_repuesto":
      return "#38bdf8";
    case "resuelto":
      return "#4ade80";
    default:
      return "#94a3b8";
  }
}

/** Municipios con centro conocido (selector rápido y coherencia con el mapa). */
export function listKnownMunicipios(): string[] {
  return Object.keys(MUNICIPIO_COORDS);
}
