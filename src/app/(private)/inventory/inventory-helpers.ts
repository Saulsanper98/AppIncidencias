import type { AssetType } from "@/lib/domain";

export type InventoryStatus = "ok" | "bajo" | "agotado";

export type InventorySummaryItem = {
  assetType: AssetType;
  partCode: string;
  partName: string;
  totalAvailable: number;
  totalReserved: number;
  minimumLevel: number;
  status: InventoryStatus;
  /** Tickets con reserva o consumo de esta pieza (API inventario) */
  ticketCount?: number;
};

export type StatusFilter = "todos" | "alertas" | InventoryStatus;

export type SortKey = "riesgo" | "nombre" | "codigo" | "cobertura" | "fisico" | "reservado";

export const ASSET_TYPE_LABEL_ES: Record<AssetType, string> = {
  validadora: "Validadora",
  sae: "SAE",
  router: "Router",
  pantalla: "Pantalla",
};

export function coveragePercent(item: InventorySummaryItem): number {
  return Math.round((item.totalAvailable / Math.max(item.minimumLevel, 1)) * 100);
}

export function physicalOnHand(item: InventorySummaryItem): number {
  return item.totalAvailable + item.totalReserved;
}

export function shortfallUnits(item: InventorySummaryItem): number {
  return Math.max(0, item.minimumLevel - item.totalAvailable);
}

/** Cobertura usando unidades físicas (disp. + reserv.) frente al mínimo. */
export function physicalCoveragePercent(item: InventorySummaryItem): number {
  const on = physicalOnHand(item);
  return Math.round((on / Math.max(item.minimumLevel, 1)) * 100);
}

function sortByRisk(a: InventorySummaryItem, b: InventorySummaryItem): number {
  const rank = (s: InventoryStatus) => (s === "agotado" ? 0 : s === "bajo" ? 1 : 2);
  const d = rank(a.status) - rank(b.status);
  if (d !== 0) return d;
  return coveragePercent(a) - coveragePercent(b);
}

export function applySort(list: InventorySummaryItem[], sortKey: SortKey): InventorySummaryItem[] {
  const copy = list.slice();
  switch (sortKey) {
    case "riesgo":
      copy.sort(sortByRisk);
      break;
    case "nombre":
      copy.sort((a, b) => a.partName.localeCompare(b.partName, "es"));
      break;
    case "codigo":
      copy.sort((a, b) => a.partCode.localeCompare(b.partCode, "es"));
      break;
    case "cobertura":
      copy.sort((a, b) => coveragePercent(a) - coveragePercent(b));
      break;
    case "fisico":
      copy.sort((a, b) => physicalOnHand(a) - physicalOnHand(b));
      break;
    case "reservado":
      copy.sort((a, b) => a.totalReserved - b.totalReserved);
      break;
    default:
      copy.sort(sortByRisk);
  }
  return copy;
}

export function filterByStatus(list: InventorySummaryItem[], statusFilter: StatusFilter): InventorySummaryItem[] {
  if (statusFilter === "todos") return list;
  if (statusFilter === "alertas") return list.filter((i) => i.status === "bajo" || i.status === "agotado");
  return list.filter((i) => i.status === statusFilter);
}

export function filterBySearch(list: InventorySummaryItem[], q: string): InventorySummaryItem[] {
  const t = q.trim().toLowerCase();
  if (!t) return list;
  return list.filter(
    (i) =>
      i.partName.toLowerCase().includes(t) ||
      i.partCode.toLowerCase().includes(t) ||
      i.assetType.toLowerCase().includes(t) ||
      ASSET_TYPE_LABEL_ES[i.assetType].toLowerCase().includes(t),
  );
}

export function filterAdvanced(
  list: InventorySummaryItem[],
  opts: {
    onlyReserved: boolean;
    coverageUnder120: boolean;
    assetTypes: AssetType[];
  },
): InventorySummaryItem[] {
  let out = list;
  if (opts.onlyReserved) {
    out = out.filter((i) => i.totalReserved > 0);
  }
  if (opts.coverageUnder120) {
    out = out.filter((i) => coveragePercent(i) < 120);
  }
  if (opts.assetTypes.length > 0) {
    const set = new Set(opts.assetTypes);
    out = out.filter((i) => set.has(i.assetType));
  }
  return out;
}

export function slugFromFilters(parts: string[]): string {
  const s = parts
    .filter(Boolean)
    .join("_")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return s || "todos";
}

/** Ruta relativa para `Link` y navegación interna. */
export function ticketsPathForPartCode(partCode: string): string {
  return `/tickets?partCode=${encodeURIComponent(partCode)}`;
}

export function buildInventoryCsv(
  rows: InventorySummaryItem[],
  opts: { spanishHeaders: boolean; delimiter: ";" | "," },
): string {
  const d = opts.delimiter;
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = opts.spanishHeaders
    ? [
        "codigo",
        "nombre",
        "tipo_activo",
        "disponible_libre",
        "reservado",
        "fisico",
        "pct_libre_sobre_fisico",
        "pct_reservado_sobre_fisico",
        "minimo",
        "cobertura_libre_pct",
        "cobertura_fisico_pct",
        "estado",
        "n_tickets_vinculados",
        "url_tickets_filtrados",
      ]
    : [
        "codigo",
        "nombre",
        "tipo_activo",
        "disponible_libre",
        "reservado",
        "fisico",
        "pct_libre",
        "pct_reservado",
        "minimo",
        "cobertura_libre_pct",
        "cobertura_fisico_pct",
        "estado",
        "n_tickets",
        "url_tickets",
      ];

  const lines = rows.map((i) => {
    const onHand = physicalOnHand(i);
    const cov = coveragePercent(i);
    const covPhys = physicalCoveragePercent(i);
    const reservedPct = onHand > 0 ? Math.min(100, Math.round((i.totalReserved / onHand) * 1000) / 10) : 0;
    const freePct = onHand > 0 ? Math.round((100 - reservedPct) * 10) / 10 : 0;
    const nTickets = i.ticketCount ?? 0;
    const rel = ticketsPathForPartCode(i.partCode);
    const ticketUrl =
      typeof globalThis !== "undefined" && "location" in globalThis && globalThis.location?.origin
        ? `${globalThis.location.origin}${rel}`
        : rel;
    const cells = [
      i.partCode,
      i.partName,
      i.assetType,
      String(i.totalAvailable),
      String(i.totalReserved),
      String(onHand),
      String(freePct),
      String(reservedPct),
      String(i.minimumLevel),
      String(cov),
      String(covPhys),
      i.status,
      String(nTickets),
      ticketUrl,
    ];
    return cells.map((cell) => escape(String(cell))).join(d);
  });
  return [header.join(d), ...lines].join("\n");
}

export function rowSummaryForClipboard(item: InventorySummaryItem): string {
  const onHand = physicalOnHand(item);
  const cov = coveragePercent(item);
  const covPhys = physicalCoveragePercent(item);
  const n = item.ticketCount ?? 0;
  const rel = ticketsPathForPartCode(item.partCode);
  const ticketUrl =
    typeof globalThis !== "undefined" && "location" in globalThis && globalThis.location?.origin
      ? `${globalThis.location.origin}${rel}`
      : rel;
  return `${item.partCode} · ${item.partName} | Disp ${item.totalAvailable} · Res ${item.totalReserved} · Físico ${onHand} · Mín ${item.minimumLevel} · Cob. libre ${cov}% · Cob. físico ${covPhys}% · ${item.status} · Tickets ${n} · ${ticketUrl}`;
}
