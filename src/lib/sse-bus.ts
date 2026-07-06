/**
 * Bus de eventos in-process para empujar mensajes al stream SSE existente
 * en `/api/notifications/stream` desde cualquier parte del servidor (route
 * handler, poller singleton, hook de Prisma...).
 *
 * Diseño:
 *  - Singleton por proceso, persistente entre hot-reloads en desarrollo via
 *    `globalThis` (mismo patron que `src/lib/prisma.ts`).
 *  - Cada conexion SSE registra un listener al abrirse y lo desregistra al
 *    cerrarse. El bus solo conoce listeners en memoria; si la app corre con
 *    multiples workers, cada worker tiene el suyo. En NSSM corremos un unico
 *    proceso Node, asi que con un solo bus basta.
 *  - Los eventos son arbitrarios (`type` + `payload` JSON-serializable). El
 *    stream del cliente decide a cuales suscribirse vie `addEventListener`.
 *
 * No se utiliza el `EventEmitter` de `node:events` porque queremos un API
 * minimal sin riesgo de heredar listeners "stale" entre rutas.
 */

export type SseEventName =
  | "desvio_nuevo"
  | "desvio_actualizado"
  | "desvio_recordatorio"
  | "announcement_new"
  | "announcement_updated"
  | "announcement_deleted"
  // Eventos de tickets — usados por la bandeja y el detalle para refrescarse
  // en tiempo real sin recargar la página. Payload mínimo:
  //   { id, busId, status, priority, title, assignedToUserId?, by? }
  | "ticket_created"
  | "ticket_updated"
  | "ticket_status_changed"
  | "ticket_assigned"
  | "ticket_commented"
  | "ticket_deleted"
  | "ticket_deletion_requested"
  | "ticket_deletion_rejected";

export type SseListener = (event: { type: SseEventName; payload: unknown }) => void;

class SseBus {
  private readonly listeners = new Set<SseListener>();

  subscribe(listener: SseListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(type: SseEventName, payload: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener({ type, payload });
      } catch (err) {
        // Un listener roto no debe tumbar al resto. Solo logueamos.
        console.warn("sse-bus listener error:", err);
      }
    }
  }

  /** Devuelve el numero actual de subscriptores (debug / metricas). */
  get size(): number {
    return this.listeners.size;
  }
}

const globalForBus = globalThis as unknown as { __ccmgcSseBus?: SseBus };

// Siempre en globalThis: en producción Next empaqueta cada route handler en
// un chunk distinto y, sin singleton global, POST /api/announcements publica
// en un bus distinto al que escucha GET /api/notifications/stream.
export const sseBus: SseBus = globalForBus.__ccmgcSseBus ?? new SseBus();
globalForBus.__ccmgcSseBus = sseBus;
