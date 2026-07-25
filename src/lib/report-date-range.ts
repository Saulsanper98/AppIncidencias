/** Utilidades de fechas para reportes operativos (UTC). */

export type OperationalReportRangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "last90"
  | "last180"
  | "custom";

export function dayKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfDayUtc(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

export function endOfDayUtc(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(23, 59, 59, 999);
  return c;
}

export function parseDateOnlyUtc(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

export function resolveOperationalReportRange(searchParams: URLSearchParams): {
  since: Date;
  until: Date;
  preset: OperationalReportRangePreset;
  label: string;
} {
  const now = new Date();
  const todayStart = startOfDayUtc(now);
  const fromParam = parseDateOnlyUtc(searchParams.get("from"));
  const toParam = parseDateOnlyUtc(searchParams.get("to"));
  if (fromParam) {
    const since = startOfDayUtc(fromParam);
    const until = toParam ? endOfDayUtc(toParam) : endOfDayUtc(fromParam);
    const label =
      fromParam.getTime() === (toParam?.getTime() ?? fromParam.getTime())
        ? `Día ${dayKeyUtc(fromParam)}`
        : `${dayKeyUtc(fromParam)} → ${dayKeyUtc(toParam ?? fromParam)}`;
    return { since, until, preset: "custom", label };
  }

  const range = (searchParams.get("range") ?? "").toLowerCase();
  switch (range) {
    case "today":
      return { since: todayStart, until: endOfDayUtc(now), preset: "today", label: "Hoy" };
    case "yesterday": {
      const y = new Date(todayStart);
      y.setUTCDate(y.getUTCDate() - 1);
      return { since: y, until: endOfDayUtc(y), preset: "yesterday", label: "Ayer" };
    }
    case "last7":
    case "last30":
    case "last90":
    case "last180": {
      const map: Record<string, number> = { last7: 7, last30: 30, last90: 90, last180: 180 };
      const n = map[range];
      const since = new Date(todayStart);
      since.setUTCDate(since.getUTCDate() - (n - 1));
      return {
        since,
        until: endOfDayUtc(now),
        preset: range as OperationalReportRangePreset,
        label: `Últimos ${n} días`,
      };
    }
  }

  const daysParam = Number(searchParams.get("days") ?? 30);
  const days = Math.min(180, Math.max(1, Number.isFinite(daysParam) ? daysParam : 30));
  const since = new Date(todayStart);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const presetById: Record<number, OperationalReportRangePreset> = {
    7: "last7",
    30: "last30",
    90: "last90",
    180: "last180",
  };
  return {
    since,
    until: endOfDayUtc(now),
    preset: presetById[days] ?? "custom",
    label: `Últimos ${days} días`,
  };
}
