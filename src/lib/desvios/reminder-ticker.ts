/**
 * Ticker servidor que detecta desvios en ventana de aviso y los empuja por SSE.
 * No depende de timers del navegador (throttling, pestaña en segundo plano…).
 */

import { getDesvioRemindersSnapshot } from "@/lib/desvios/repo";
import { sseBus } from "@/lib/sse-bus";

const TICK_MS = 15_000;
const REPUBLISH_MS = 90_000;

let timerId: ReturnType<typeof setInterval> | null = null;
const lastPublishedAt = new Map<string, number>();

function reminderKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

async function tick(): Promise<void> {
  try {
    const snapshot = await getDesvioRemindersSnapshot();
    const now = Date.now();
    const dueKeys = new Set<string>();

    for (const item of snapshot.due) {
      const key = reminderKey(item.kind, item.desvio.id);
      dueKeys.add(key);
      const last = lastPublishedAt.get(key) ?? 0;
      if (now - last < REPUBLISH_MS) continue;
      lastPublishedAt.set(key, now);
      sseBus.publish("desvio_recordatorio", item);
    }

    for (const key of lastPublishedAt.keys()) {
      if (!dueKeys.has(key)) lastPublishedAt.delete(key);
    }
  } catch (error) {
    console.warn("[desvio-reminder-ticker] tick error:", error);
  }
}

export function startDesvioReminderTicker(): { running: boolean; tickMs: number } {
  if (timerId) return { running: true, tickMs: TICK_MS };
  void tick();
  timerId = setInterval(() => void tick(), TICK_MS);
  console.log(`[desvio-reminder-ticker] arrancado · tick=${TICK_MS / 1000}s`);
  return { running: true, tickMs: TICK_MS };
}

export function stopDesvioReminderTicker(): void {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}
