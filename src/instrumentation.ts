/**
 * Hook de instrumentacion de Next.js (es la convencion oficial desde 15.x).
 * Se ejecuta una sola vez por proceso al arrancar el servidor.
 *
 * Aqui solo lanzamos el poller de desvios. Si `EMAIL_PROVIDER` no esta
 * configurada, `start()` resuelve a un provider "disabled" sin efectos.
 *
 * El handler solo arranca el poller en el runtime "nodejs" (no en Edge,
 * porque ahi no hay sockets ni filesystem). Ademas se aisla en `try/catch`
 * para que un fallo del poller nunca tumbe el arranque del servidor.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { getDesviosPoller } = await import("@/lib/desvios/email-poller");
    const status = await getDesviosPoller().start();
    if (status.provider !== "disabled") {
      console.log(
        `[instrumentation] desvios poller -> provider=${status.provider}, ` +
          `interval=${status.intervalSeconds}s, sender=${status.sender}`,
      );
    } else {
      console.log(
        "[instrumentation] desvios poller deshabilitado (defina EMAIL_PROVIDER en .env)",
      );
    }
  } catch (err) {
    console.warn("[instrumentation] no se pudo arrancar el poller de desvios:", err);
  }

  // Scheduler interno: informe diario automático + reglas (escalado / SLA).
  // Aislado en un try/catch propio: si falla, no debe tumbar al poller.
  try {
    const { getScheduler } = await import("@/lib/scheduler");
    const status = getScheduler().start();
    console.log(
      `[instrumentation] scheduler -> enabled=${status.enabled}, ` +
        `interval=${status.intervalSeconds}s, dailyHour=${status.dailyReportHour}`,
    );
  } catch (err) {
    console.warn("[instrumentation] no se pudo arrancar el scheduler:", err);
  }

  try {
    const { startDesvioReminderTicker } = await import("@/lib/desvios/reminder-ticker");
    startDesvioReminderTicker();
  } catch (err) {
    console.warn("[instrumentation] no se pudo arrancar el ticker de avisos de desvios:", err);
  }
}
