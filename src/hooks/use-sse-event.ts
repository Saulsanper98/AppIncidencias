"use client";

import { useEffect, useRef } from "react";

import { sseClient, type SseClientListener } from "@/lib/sse-client";

/**
 * Suscribe el componente a un evento del stream SSE compartido.
 *
 * El listener puede cambiar entre renders sin re-suscribir gracias al ref:
 * la suscripción al singleton solo se monta/desmonta cuando cambia
 * `eventName` (lo normal: nunca).
 *
 * @example
 *   useSseEvent("announcement_new", (event) => {
 *     const data = JSON.parse(event.data);
 *     // ...
 *   });
 */
export function useSseEvent(eventName: string, listener: SseClientListener): void {
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  }, [listener]);

  useEffect(() => {
    const unsubscribe = sseClient.subscribe(eventName, (event) => {
      listenerRef.current(event);
    });
    return unsubscribe;
  }, [eventName]);
}
