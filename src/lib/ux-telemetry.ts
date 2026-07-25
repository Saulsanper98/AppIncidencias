"use client";

/**
 * ux-telemetry.ts — Cliente de telemetría UX.
 *
 * Funcionamiento:
 *   - Cada llamada a `trackUxEvent(name, props, durationMs?)` mete un evento
 *     en una cola en memoria.
 *   - Cada 5 segundos (o al cerrar la pestaña, o si la cola supera 30 eventos)
 *     se envía un batch al endpoint `/api/ux/events`.
 *   - En `beforeunload` usamos `navigator.sendBeacon` si está disponible,
 *     porque garantiza el envío aunque la pestaña esté cerrándose.
 *
 * El sessionId se genera al primer evento y se persiste en `sessionStorage`
 * para sobrevivir a navegaciones SPA pero no a cierres de pestaña.
 *
 * Filosofía: la telemetría NUNCA puede romper la app. Si falla la red,
 * pierde el batch silenciosamente y sigue.
 */

const SESSION_STORAGE_KEY = "ccmgc_ux_session";
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_AT_QUEUE_SIZE = 30;
const ENDPOINT = "/api/ux/events";

type QueuedEvent = {
  eventName: string;
  sessionId: string;
  /**
   * Path al que se atribuye el evento. Por defecto `window.location.pathname`
   * en el momento del track, pero los flujos largos (`useTimedFlow`,
   * `useTrackPageVisits`) pasan un override para que el evento se atribuya
   * a la página donde realmente ocurrió, no a aquella a la que el usuario
   * acaba de navegar.
   */
  path: string;
  durationMs?: number | null;
  clientTs: number;
  props?: Record<string, unknown> | null;
};

let queue: QueuedEvent[] = [];
let timerId: number | null = null;
let cachedSessionId: string | null = null;
let listenersInstalled = false;

function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  if (typeof window === "undefined") {
    return "ssr";
  }
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }
    // crypto.randomUUID está disponible en todos los navegadores modernos.
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, fresh);
    cachedSessionId = fresh;
    return fresh;
  } catch {
    // sessionStorage bloqueado (modo privado estricto, etc.)
    const fresh = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    cachedSessionId = fresh;
    return fresh;
  }
}

function currentPath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname || "/";
}

function scheduleFlush() {
  if (timerId !== null) return;
  if (typeof window === "undefined") return;
  timerId = window.setTimeout(() => {
    timerId = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

function installListeners() {
  if (listenersInstalled) return;
  if (typeof window === "undefined") return;
  listenersInstalled = true;

  // Al cerrar pestaña: enviamos con sendBeacon para garantizar entrega.
  window.addEventListener("beforeunload", () => flushBeacon());
  // Cuando la pestaña pasa a oculta, aprovechamos para hacer flush
  // (cubre el caso de switch de pestaña que luego no vuelve).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBeacon();
  });

  installFetchInterceptor();
}

/**
 * Intercepta `window.fetch` para registrar respuestas de error (>=400)
 * y fallos de red como eventos `api_error`. Es la mejor forma de captar
 * errores reales sin instrumentar cada llamada uno por uno.
 *
 * Reglas para evitar bucles y ruido:
 *   - No rastrea llamadas al propio endpoint `/api/ux/events` ni a recursos
 *     estáticos (Next/_next).
 *   - No rastrea HEAD/OPTIONS (suelen ser CORS preflight).
 *   - El URL se trunca al path para no guardar querystrings sensibles.
 */
let fetchPatched = false;
function installFetchInterceptor(): void {
  if (fetchPatched) return;
  if (typeof window === "undefined") return;
  if (typeof window.fetch !== "function") return;
  fetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") ?? "GET").toUpperCase();
    let urlString = "";
    try {
      if (typeof input === "string") urlString = input;
      else if (input instanceof URL) urlString = input.toString();
      else urlString = input.url;
    } catch {
      urlString = "";
    }
    let path = urlString;
    try {
      path = new URL(urlString, window.location.origin).pathname;
    } catch {
      /* no-op */
    }
    const skip =
      method === "OPTIONS" ||
      method === "HEAD" ||
      path.startsWith("/_next") ||
      path === ENDPOINT;
    const startedAt = Date.now();
    try {
      const res = await orig(input as RequestInfo, init);
      const skipApiErrorTelemetry =
        skip ||
        (res.status === 401 &&
          (path === "/api/auth/session" ||
            path === "/api/auth/preferences" ||
            path.startsWith("/api/reports/daily/"))) ||
        (res.status === 429 &&
          (path === "/api/auth/session" || path === "/api/notifications/list"));
      if (!skipApiErrorTelemetry && res.status >= 400) {
        trackUxEvent(
          "api_error",
          {
            method,
            path,
            status: res.status,
            duration_ms: Date.now() - startedAt,
            kind: "http_error",
          },
          Date.now() - startedAt,
        );
      }
      return res;
    } catch (err) {
      if (!skip) {
        trackUxEvent(
          "api_error",
          {
            method,
            path,
            duration_ms: Date.now() - startedAt,
            kind: "network_error",
            message: (err as Error)?.message?.slice(0, 200) ?? null,
          },
          Date.now() - startedAt,
        );
      }
      throw err;
    }
  };
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
  } catch {
    // Silencioso: no reinsertamos en la cola para no acumular si hay caída
    // permanente de red. Estamos OK perdiendo telemetría puntual.
  }
}

function flushBeacon(): void {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  const body = JSON.stringify({ events: batch });
  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    try {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    } catch {
      /* fallback */
    }
  }
  // Fallback: fetch con keepalive (puede no completarse).
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Envía un evento de telemetría. NUNCA lanza; los errores se tragan.
 *
 * @param name nombre del evento (convención: `dominio_accion`, p.ej. `ticket_create_open`)
 * @param props payload opcional con datos específicos
 * @param durationMs duración en ms si el evento mide tiempo (page_visit, ticket_create_complete, ...)
 * @param pathOverride si se proporciona, sustituye al `window.location.pathname`
 *        actual. Usado por flujos largos para atribuir el evento a la página
 *        donde realmente ocurrió aunque el usuario ya haya navegado fuera.
 */
export function trackUxEvent(
  name: string,
  props?: Record<string, unknown> | null,
  durationMs?: number | null,
  pathOverride?: string | null,
): void {
  if (typeof window === "undefined") return;
  installListeners();
  queue.push({
    eventName: name,
    sessionId: getSessionId(),
    path: pathOverride ?? currentPath(),
    durationMs: durationMs ?? null,
    clientTs: Date.now(),
    props: props ?? null,
  });
  if (queue.length >= FLUSH_AT_QUEUE_SIZE) {
    void flush();
  } else {
    scheduleFlush();
  }
}

/**
 * Hook util para medir flujos multi-paso con duraciones.
 *
 * Uso:
 *   const flow = useTimedFlow("ticket_create");
 *   useEffect(() => flow.start(), []);
 *   const onNext = (step: string) => flow.step(step);
 *   const onSubmit = () => flow.complete({ template_id: id });
 *   // si el componente se desmonta sin completar, llama a flow.abandon("unmount").
 *
 * Internamente cada llamada emite un evento `{name}_open|step|complete|abandon`.
 */
export type TimedFlow = {
  start: (props?: Record<string, unknown>) => void;
  step: (stepName: string, props?: Record<string, unknown>) => void;
  complete: (props?: Record<string, unknown>) => void;
  abandon: (reason?: string, props?: Record<string, unknown>) => void;
};

import { useEffect, useRef } from "react";

export function useTimedFlow(name: string): TimedFlow {
  const startedAtRef = useRef<number | null>(null);
  const lastStepAtRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  /**
   * Path donde se inició el flujo. Imprescindible para no etiquetar el
   * abandono con la página de destino cuando el usuario navega fuera.
   */
  const flowPathRef = useRef<string | null>(null);

  // Auto-abandono al desmontar si no se completó.
  useEffect(() => {
    return () => {
      if (startedAtRef.current && !completedRef.current) {
        trackUxEvent(
          `${name}_abandon`,
          { reason: "unmount" },
          Date.now() - startedAtRef.current,
          flowPathRef.current,
        );
      }
    };
  }, [name]);

  return {
    start: (props) => {
      startedAtRef.current = Date.now();
      lastStepAtRef.current = Date.now();
      completedRef.current = false;
      flowPathRef.current = currentPath();
      trackUxEvent(`${name}_open`, props ?? null, null, flowPathRef.current);
    },
    step: (stepName, props) => {
      const now = Date.now();
      const sinceLast = lastStepAtRef.current ? now - lastStepAtRef.current : null;
      lastStepAtRef.current = now;
      trackUxEvent(
        `${name}_step`,
        { step: stepName, ...(props ?? {}) },
        sinceLast,
        flowPathRef.current,
      );
    },
    complete: (props) => {
      const total = startedAtRef.current ? Date.now() - startedAtRef.current : null;
      completedRef.current = true;
      trackUxEvent(`${name}_complete`, props ?? null, total, flowPathRef.current);
    },
    abandon: (reason, props) => {
      const total = startedAtRef.current ? Date.now() - startedAtRef.current : null;
      completedRef.current = true; // así el unmount no duplica el abandono
      trackUxEvent(
        `${name}_abandon`,
        { reason: reason ?? "manual", ...(props ?? {}) },
        total,
        flowPathRef.current,
      );
    },
  };
}

/**
 * Hook que mide visitas a la página actual. Se monta una vez en el layout
 * privado y, cada vez que cambia el `pathname`, dispara `page_visit` con la
 * duración de la visita anterior.
 *
 * Tomar como cierre: cambio de path, ocultar pestaña o cerrar pestaña.
 */
export function useTrackPageVisits(pathname: string): void {
  const startedAtRef = useRef<number | null>(null);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const now = Date.now();
    if (prevPathRef.current && startedAtRef.current) {
      const duration = now - startedAtRef.current;
      // IMPORTANTE: el evento se atribuye al path que el usuario acaba
      // de ABANDONAR (donde realmente pasó el tiempo), no al nuevo.
      // Anteriormente se cogía `window.location.pathname` que ya era el
      // destino → distorsionaba completamente la KPI de "tiempo por sección".
      trackUxEvent(
        "page_visit",
        { to_path: pathname },
        duration,
        prevPathRef.current,
      );
    }
    prevPathRef.current = pathname;
    startedAtRef.current = now;
  }, [pathname]);

  // Cuando la pestaña pasa a oculta o se cierra, emitimos una visita
  // "parcial" del path actual para no perder el tiempo en página. La cola
  // se vacía después con sendBeacon (installListeners).
  useEffect(() => {
    const emitPending = (reason: string) => {
      if (!prevPathRef.current || !startedAtRef.current) return;
      const duration = Date.now() - startedAtRef.current;
      if (duration < 500) return; // ruido: visitas <500 ms
      trackUxEvent(
        "page_visit",
        { reason },
        duration,
        prevPathRef.current,
      );
      // Reseteamos el inicio para no doblar el tiempo si vuelve a la pestaña.
      startedAtRef.current = Date.now();
    };
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") emitPending("hidden");
    };
    const onBeforeUnload = () => emitPending("unload");
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", onBeforeUnload);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", onBeforeUnload);
      }
      // Desmontaje React (logout, navegación fuera del layout privado).
      if (prevPathRef.current && startedAtRef.current) {
        trackUxEvent(
          "page_visit",
          { reason: "unmount" },
          Date.now() - startedAtRef.current,
          prevPathRef.current,
        );
      }
    };
  }, []);
}
