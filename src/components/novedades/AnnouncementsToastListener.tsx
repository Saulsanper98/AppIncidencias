"use client";

import { useRef } from "react";

import { toast } from "@/components/toast-host";
import { useSseEvent } from "@/hooks/use-sse-event";

/**
 * Listener global que muestra un toast cada vez que el bus SSE publica
 * `announcement_new`. Se monta una sola vez en el layout privado.
 *
 * Reglas:
 *   - `critical`: NO disparamos toast porque ya hay un banner sticky muy
 *     prominente; saturar con toast es ruido.
 *   - `warning`: `toast.warning(...)` (amarillo) con duración larga.
 *   - `info` (novedades / avisos rutinarios): `toast.info(...)` corto.
 *   - Dedupe por id por si el navegador reentrega el evento al reconectar.
 *   - Reutiliza el `sseClient` compartido (no abre EventSource propio).
 */
type Payload = {
  payload?: {
    id?: string;
    kind?: "novedad" | "aviso";
    severity?: "info" | "warning" | "critical";
    title?: string;
    publishedAt?: string | null;
  };
};

export function AnnouncementsToastListener() {
  const shownIdsRef = useRef<Set<string>>(new Set());

  useSseEvent("announcement_new", (event) => {
    try {
      const parsed = JSON.parse(event.data) as Payload;
      const id = parsed.payload?.id ?? "";
      if (id && shownIdsRef.current.has(id)) return;
      if (id) shownIdsRef.current.add(id);

      const severity = parsed.payload?.severity ?? "info";
      const title = parsed.payload?.title ?? "Nuevo aviso";
      const kindLabel =
        parsed.payload?.kind === "novedad" ? "Nueva novedad" : "Aviso en vivo";

      // Críticos ya van como banner sticky.
      if (severity === "critical") return;

      if (severity === "warning") {
        toast.warning(title, { description: kindLabel, duration: 9000 });
      } else {
        toast.info(title, { description: kindLabel, duration: 6000 });
      }
    } catch {
      /* ignore */
    }
  });

  return null;
}
