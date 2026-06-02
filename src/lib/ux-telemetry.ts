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
 */
export function trackUxEvent(
  name: string,
  props?: Record<string, unknown> | null,
  durationMs?: number | null,
): void {
  if (typeof window === "undefined") return;
  installListeners();
  queue.push({
    eventName: name,
    sessionId: getSessionId(),
    path: currentPath(),
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

  // Auto-abandono al desmontar si no se completó.
  useEffect(() => {
    return () => {
      if (startedAtRef.current && !completedRef.current) {
        trackUxEvent(`${name}_abandon`, { reason: "unmount" }, Date.now() - startedAtRef.current);
      }
    };
  }, [name]);

  return {
    start: (props) => {
      startedAtRef.current = Date.now();
      lastStepAtRef.current = Date.now();
      completedRef.current = false;
      trackUxEvent(`${name}_open`, props ?? null);
    },
    step: (stepName, props) => {
      const now = Date.now();
      const sinceLast = lastStepAtRef.current ? now - lastStepAtRef.current : null;
      lastStepAtRef.current = now;
      trackUxEvent(
        `${name}_step`,
        { step: stepName, ...(props ?? {}) },
        sinceLast,
      );
    },
    complete: (props) => {
      const total = startedAtRef.current ? Date.now() - startedAtRef.current : null;
      completedRef.current = true;
      trackUxEvent(`${name}_complete`, props ?? null, total);
    },
    abandon: (reason, props) => {
      const total = startedAtRef.current ? Date.now() - startedAtRef.current : null;
      completedRef.current = true; // así el unmount no duplica el abandono
      trackUxEvent(`${name}_abandon`, { reason: reason ?? "manual", ...(props ?? {}) }, total);
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
      trackUxEvent(
        "page_visit",
        { from_path: prevPathRef.current },
        duration,
      );
    }
    prevPathRef.current = pathname;
    startedAtRef.current = now;
  }, [pathname]);

  // Al desmontar (cierre de app o logout), cerramos la visita actual.
  useEffect(() => {
    return () => {
      if (prevPathRef.current && startedAtRef.current) {
        trackUxEvent(
          "page_visit",
          { from_path: prevPathRef.current, reason: "unmount" },
          Date.now() - startedAtRef.current,
        );
      }
    };
  }, []);
}
