export type ShiftKey = "M" | "T" | "N";

export const SHIFT_LABEL: Record<ShiftKey, string> = {
  M: "Mañana",
  T: "Tarde",
  N: "Noche",
};

export const VALID_SHIFTS = new Set<ShiftKey>(["M", "T", "N"]);

export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Turno CCMGC: M 06–14, T 14–22, N 22–06. */
export function currentShiftFromHour(hour: number): ShiftKey {
  if (hour >= 6 && hour < 14) return "M";
  if (hour >= 14 && hour < 22) return "T";
  return "N";
}

export function currentShiftNow(): ShiftKey {
  return currentShiftFromHour(new Date().getHours());
}

export function shiftWindowLabel(shift: ShiftKey): string {
  if (shift === "M") return "06:00 – 14:00";
  if (shift === "T") return "14:00 – 22:00";
  return "22:00 – 06:00";
}

/** Minutos hasta el cierre del turno actual (M 14:00 · T 22:00 · N 06:00). */
export function minutesUntilShiftEnd(now: Date = new Date()): number {
  const h = now.getHours();
  const minsOfDay = h * 60 + now.getMinutes() + now.getSeconds() / 60;
  let endMins: number;
  if (h >= 6 && h < 14) {
    endMins = 14 * 60;
  } else if (h >= 14 && h < 22) {
    endMins = 22 * 60;
  } else if (h >= 22) {
    endMins = 24 * 60 + 6 * 60;
  } else {
    endMins = 6 * 60;
  }
  return Math.max(0, Math.round(endMins - minsOfDay));
}

/** True si quedan `thresholdMins` o menos para el relevo. */
export function isNearShiftEnd(thresholdMins = 45, now: Date = new Date()): boolean {
  return minutesUntilShiftEnd(now) <= thresholdMins;
}

export function formatRelativeShort(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 5) return "ahora mismo";
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}
