import type { TicketPriority, TicketStatus } from "@/lib/domain";

/** Ámbito operativo para mapa y vistas que separan tickets abiertos de cerrados. */
export type TicketScopeFilter = "activos" | "resueltos" | "todos";

export function normalizeTicketScopeFilter(value: string | null): TicketScopeFilter {
  if (value === "resueltos" || value === "todos") return value;
  if (value === "activos") return "activos";
  return "activos";
}

/**
 * Condición Prisma de `status` según ámbito y filtro granular.
 * Si hay `status` concreto, prevalece sobre el ámbito.
 */
export function ticketStatusWhereForFilters(
  status: TicketStatus | "todos",
  scope: TicketScopeFilter,
  options: { includeBorrador?: boolean } = {},
): TicketStatus | { not: TicketStatus } | { in: TicketStatus[] } | undefined {
  if (status !== "todos") {
    if (status === "borrador" && options.includeBorrador) {
      return "borrador";
    }
    return status;
  }
  if (scope === "activos") return { not: "resuelto" };
  if (scope === "resueltos") return "resuelto";
  return undefined;
}

const OPERATIVE_STATUSES: TicketStatus[] = [
  "abierto",
  "en_proceso",
  "esperando_repuesto",
  "resuelto",
];

/**
 * Normaliza el parámetro `status` de filtros de tickets en APIs.
 * Por defecto incluye `borrador` (bandeja); mapa/export lo excluyen.
 */
export function normalizeTicketStatusFilter(
  value: string | null,
  options: { includeBorrador?: boolean } = { includeBorrador: true },
): TicketStatus | "todos" {
  if (!value || value === "todos") return "todos";

  if (options.includeBorrador && value === "borrador") return "borrador";

  if (OPERATIVE_STATUSES.includes(value as TicketStatus)) {
    return value as TicketStatus;
  }

  return "todos";
}

/** Normaliza el parámetro `priority` de filtros de tickets. */
export function normalizeTicketPriorityFilter(value: string | null): TicketPriority | "todos" {
  if (!value || value === "todos") return "todos";
  if (value === "alta" || value === "media" || value === "baja") return value;
  return "todos";
}

/**
 * Rango de fechas inclusivo sobre `createdAt`.
 * - Solo `from` → ese día completo.
 * - Solo `to` → ese día completo.
 * - Ambos → rango inclusivo.
 */
export function parseTicketDateRange(
  fromRaw: string | null,
  toRaw: string | null,
): { from?: Date; to?: Date } | null {
  const fromStr = fromRaw?.trim() ?? "";
  const toStr = toRaw?.trim() ?? "";
  if (!fromStr && !toStr) return null;

  const startOfDay = (ymd: string) => {
    const d = ymd.length <= 10 ? new Date(`${ymd}T00:00:00`) : new Date(ymd);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const endOfDay = (ymd: string) => {
    const d = ymd.length <= 10 ? new Date(`${ymd}T23:59:59.999`) : new Date(ymd);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  if (fromStr && !toStr) {
    const from = startOfDay(fromStr);
    const to = endOfDay(fromStr);
    if (!from || !to) return null;
    return { from, to };
  }
  if (toStr && !fromStr) {
    const from = startOfDay(toStr);
    const to = endOfDay(toStr);
    if (!from || !to) return null;
    return { from, to };
  }

  const from = startOfDay(fromStr);
  const to = endOfDay(toStr);
  if (!from && !to) return null;
  return { from, to };
}
