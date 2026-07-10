import { resolveOperationalReportRange } from "@/lib/report-date-range";

export type BiDateRange = {
  from: Date | null;
  to: Date | null;
  label: string;
  preset: string | null;
};

/**
 * Filtro de fechas para endpoints BI.
 * Prioridad: `from`+`to` > `range` preset > sin límite (solo con paginación).
 */
export function parseBiDateRange(searchParams: URLSearchParams): BiDateRange {
  const fromRaw = searchParams.get("from")?.trim();
  const toRaw = searchParams.get("to")?.trim();
  const rangeRaw = searchParams.get("range")?.trim();

  if (fromRaw || toRaw) {
    const from = fromRaw ? startOfDay(parseDate(fromRaw)) : null;
    const to = toRaw ? endOfDay(parseDate(toRaw)) : null;
    return {
      from,
      to,
      label: [fromRaw, toRaw].filter(Boolean).join(" → "),
      preset: "custom",
    };
  }

  if (rangeRaw && rangeRaw !== "all") {
    const resolved = resolveOperationalReportRange(searchParams);
    return {
      from: resolved.since,
      to: resolved.until,
      label: resolved.label,
      preset: resolved.preset,
    };
  }

  return { from: null, to: null, label: "Sin límite", preset: null };
}

function parseDate(value: string): Date {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Fecha inválida: ${value}`);
  }
  return d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function parseBiPagination(searchParams: URLSearchParams): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(5000, Math.max(1, Number(searchParams.get("pageSize") ?? "2000") || 2000));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
