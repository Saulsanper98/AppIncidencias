"use client";

import { useRef } from "react";

import { toast } from "@/components/toast-host";
import { useSseEvent } from "@/hooks/use-sse-event";

/**
 * Listener global que muestra un toast cada vez que el bus SSE publica
 * `announcement_new`. Se monta una sola vez en el layout privado.
 *
 * Reglas:
 *   - Solo se notifica por toast cuando es un `aviso` de severidad `warning`.
 *   - `critical` ya se muestra con banner sticky y evita ruido duplicado.
 *   - `novedad` y severidad `info` no muestran toast.
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
      const kind = parsed.payload?.kind ?? "aviso";

      if (kind !== "aviso") return;
      if (severity === "critical") return;
      if (severity !== "warning") return;

      toast.warning(title, { description: "Aviso en vivo", duration: 9000 });
    } catch {
      /* ignore */
    }
  });

  return null;
}
