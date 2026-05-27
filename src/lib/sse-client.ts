/**
 * Cliente SSE singleton compartido entre todos los componentes del lado del
 * cliente.
 *
 * Antes, cada componente (sidebar, banner, campana, listeners de toasts,
 * panel /novedades…) abría su propio `new EventSource("/api/notifications/stream")`.
 * Eso suponía 5-6 conexiones HTTP persistentes POR PESTAÑA, lo que con
 * varios usuarios y pestañas saturaba al servidor (cada conexión es un thread
 * ocupado que hace polling a Prisma cada 15s).
 *
 * Este módulo expone un singleton que mantiene UNA sola conexión y reparte
 * los eventos por nombre a múltiples listeners. Cuando ya no quedan
 * suscriptores, cierra la conexión.
 *
 * Uso:
 *   import { sseClient } from "@/lib/sse-client";
 *   const unsubscribe = sseClient.subscribe("desvio_nuevo", (ev) => { ... });
 *   // ...al desmontar:
 *   unsubscribe();
 *
 * En componentes React es más cómodo usar el hook `useSseEvent` en
 * `src/hooks/use-sse-event.ts`, que se encarga del ciclo de vida.
 */

export type SseClientListener = (event: MessageEvent<string>) => void;

class SseClient {
  private source: EventSource | null = null;
  private readonly listenersByEvent = new Map<string, Set<SseClientListener>>();
  /** Wrappers registrados en el EventSource (uno por nombre de evento). */
  private readonly nativeHandlers = new Map<string, EventListener>();
  /** Reintento exponencial cuando se rompe la conexión. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  /** Suscribe un listener a un evento concreto. Devuelve el `unsubscribe`. */
  subscribe(eventName: string, listener: SseClientListener): () => void {
    if (typeof window === "undefined") {
      // En server-side render no hay EventSource; devolvemos noop.
      return () => {};
    }
    let listeners = this.listenersByEvent.get(eventName);
    if (!listeners) {
      listeners = new Set();
      this.listenersByEvent.set(eventName, listeners);
    }
    listeners.add(listener);
    this.ensureConnection();
    this.ensureNativeHandler(eventName);

    return () => {
      const set = this.listenersByEvent.get(eventName);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) {
        this.listenersByEvent.delete(eventName);
        const native = this.nativeHandlers.get(eventName);
        if (native && this.source) {
          this.source.removeEventListener(eventName, native);
        }
        this.nativeHandlers.delete(eventName);
      }
      this.maybeDisconnect();
    };
  }

  private ensureConnection() {
    if (this.source) return;
    try {
      this.source = new EventSource("/api/notifications/stream");
      this.source.onopen = () => {
        this.reconnectAttempts = 0;
      };
      this.source.onerror = () => {
        // EventSource reintenta solo, pero si el navegador lo cierra (p. ej.
        // por "Forbidden" tras logout), nosotros forzamos un retry exponencial.
        if (this.source && this.source.readyState === EventSource.CLOSED) {
          this.source = null;
          this.scheduleReconnect();
        }
      };
      // Re-registramos todos los handlers nativos que ya teníamos.
      for (const eventName of this.listenersByEvent.keys()) {
        this.ensureNativeHandler(eventName);
      }
    } catch {
      this.source = null;
    }
  }

  private ensureNativeHandler(eventName: string) {
    if (!this.source) return;
    if (this.nativeHandlers.has(eventName)) return;
    const handler: EventListener = (ev) => {
      const set = this.listenersByEvent.get(eventName);
      if (!set || set.size === 0) return;
      for (const listener of set) {
        try {
          listener(ev as MessageEvent<string>);
        } catch (error) {
          console.warn("sse-client listener error:", error);
        }
      }
    };
    this.source.addEventListener(eventName, handler);
    this.nativeHandlers.set(eventName, handler);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.listenersByEvent.size === 0) return; // nadie escucha → no reintentar
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(5, this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnection();
    }, delay);
  }

  private maybeDisconnect() {
    if (this.listenersByEvent.size > 0) return;
    if (this.source) {
      try {
        this.source.close();
      } catch {
        /* ignore */
      }
      this.source = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** Solo para debug. */
  get activeEventCount(): number {
    return this.listenersByEvent.size;
  }
}

const globalForClient = globalThis as unknown as { __ccmgcSseClient?: SseClient };
export const sseClient: SseClient = globalForClient.__ccmgcSseClient ?? new SseClient();
if (typeof window !== "undefined") {
  globalForClient.__ccmgcSseClient = sseClient;
}
