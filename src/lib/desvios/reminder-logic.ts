import type { DesvioResumen } from "@/lib/desvios/types";

export const DESVIO_REMINDER_MINUTES = 10;
export const DESVIO_REMINDER_MS = DESVIO_REMINDER_MINUTES * 60 * 1000;

export type DesvioReminderKind = "start" | "end";

export type DesvioReminderItem = {
  kind: DesvioReminderKind;
  desvio: DesvioResumen;
};

export function reminderEventMs(item: DesvioReminderItem): number {
  return item.kind === "start"
    ? new Date(item.desvio.fecha_inicio).getTime()
    : new Date(item.desvio.fecha_fin).getTime();
}

export function needsDesvioStartReminder(desvio: DesvioResumen, now = Date.now()): boolean {
  if (desvio.estado !== "PENDIENTE") return false;
  const startMs = new Date(desvio.fecha_inicio).getTime();
  if (!Number.isFinite(startMs)) return false;
  return startMs - now <= DESVIO_REMINDER_MS;
}

/** @deprecated Usar needsDesvioStartReminder */
export const needsDesvioConfirmReminder = needsDesvioStartReminder;

export function needsDesvioEndReminder(desvio: DesvioResumen, now = Date.now()): boolean {
  if (desvio.estado !== "ACTIVO") return false;
  if (desvio.sin_fecha_fin) return false;
  const endMs = new Date(desvio.fecha_fin).getTime();
  if (!Number.isFinite(endMs)) return false;
  return endMs - now <= DESVIO_REMINDER_MS;
}

export function pickDueDesvioReminder(
  due: DesvioReminderItem[],
  dismissed: Set<string>,
  now = Date.now(),
): DesvioReminderItem | null {
  return (
    due
      .filter((item) => {
        if (dismissed.has(`${item.kind}:${item.desvio.id}`)) return false;
        return item.kind === "start"
          ? needsDesvioStartReminder(item.desvio, now)
          : needsDesvioEndReminder(item.desvio, now);
      })
      .sort((a, b) => reminderEventMs(a) - reminderEventMs(b))[0] ?? null
  );
}

export type DesvioRemindersSnapshot = {
  due: DesvioReminderItem[];
  /** ISO del proximo cruce a ventana de aviso; null si no hay futuros programados. */
  nextWakeAt: string | null;
};
