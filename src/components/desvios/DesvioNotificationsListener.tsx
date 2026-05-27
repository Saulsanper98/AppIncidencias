"use client";

import { useRef } from "react";

import { toast } from "@/components/toast-host";
import { useSseEvent } from "@/hooks/use-sse-event";

/**
 * Listener global que muestra un toast cada vez que el bus SSE publica un
 * evento `desvio_nuevo`. Se monta una sola vez en el layout privado para que
 * los operadores vean el aviso esten en la pagina que esten.
 *
 * Reglas:
 *   - Toast con la via, las lineas afectadas y la hora de inicio.
 *   - Si la urgencia es "alta" usamos `toast.warning` (color amarillo); el
 *     resto va como `toast.info` para no saturar.
 *   - Evitamos disparar dos veces el mismo `id` (algunos navegadores
 *     reciben el evento duplicado al reconectar el EventSource).
 *   - Reutiliza la conexión SSE compartida (`sseClient`) para no abrir un
 *     EventSource adicional por pestaña.
 */
type Payload = {
  payload?: {
    id?: string;
    via?: string;
    lineas?: string[];
    fecha_inicio?: string;
    urgencia?: "alta" | "normal";
  };
};

export function DesvioNotificationsListener() {
  const shownIdsRef = useRef<Set<string>>(new Set());

  useSseEvent("desvio_nuevo", (event) => {
    try {
      const parsed = JSON.parse(event.data) as Payload;
      const id = parsed.payload?.id ?? "";
      if (id && shownIdsRef.current.has(id)) return;
      if (id) shownIdsRef.current.add(id);

      const via = parsed.payload?.via ?? "Nuevo desvio";
      const lineas = parsed.payload?.lineas ?? [];
      const fecha = parsed.payload?.fecha_inicio;
      const cuando = fecha
        ? new Date(fecha).toLocaleString("es-ES", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "Atlantic/Canary",
          })
        : null;

      const description = [
        lineas.length > 0 ? `Lineas ${lineas.join(", ")}` : null,
        cuando,
      ]
        .filter(Boolean)
        .join(" \u00b7 ");

      const message = `Nuevo desvio en ${via}`;
      if (parsed.payload?.urgencia === "alta") {
        toast.warning(message, { description, duration: 8000 });
      } else {
        toast.info(message, { description, duration: 6000 });
      }
    } catch {
      // ignore
    }
  });

  return null;
}
