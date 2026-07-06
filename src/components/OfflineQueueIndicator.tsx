"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";

import { flush, list, subscribe } from "@/lib/offline-ticket-queue";
import { cn } from "@/lib/utils";

/**
 * Indicador flotante que aparece SOLO cuando hay borradores pendientes
 * de envío (offline). Se actualiza automáticamente con el evento
 * `online` del navegador para intentar el flush, y por el subscribe
 * de la cola para refrescar contadores.
 *
 * Pendiente intencionalmente: el render se hace en el layout privado
 * para que sea visible desde cualquier página.
 */
export function OfflineQueueIndicator() {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    setCount(list().length);
    const unsub = subscribe(() => setCount(list().length));
    const onOnline = () => {
      setOnline(true);
      void retry();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await flush(async (payload) => {
        const res = await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
    } finally {
      setBusy(false);
    }
  };

  if (count === 0 && online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-[var(--color-warning)]/40 bg-[var(--color-warning-light)] px-3 py-1.5 text-xs font-medium text-[var(--color-warning)] shadow-lg backdrop-blur",
        (!online || count > 0) && "offline-indicator-pulse",
      )}
    >
      <CloudOff size={13} aria-hidden />
      {!online ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="offline-indicator-dot relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-warning)]/70 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
          </span>
          Sin conexión
        </span>
      ) : (
        <span>
          {count} ticket{count === 1 ? "" : "s"} pendiente{count === 1 ? "" : "s"} de enviar
        </span>
      )}
      {count > 0 ? (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={busy || !online}
          className="ml-1 rounded-full bg-[var(--color-warning)] px-2 py-0.5 text-[10px] font-semibold text-white transition-opacity disabled:opacity-50"
          title={online ? "Reintentar envío" : "Esperando conexión"}
        >
          {busy ? <RefreshCw size={10} className="animate-spin" aria-hidden /> : "Reintentar"}
        </button>
      ) : null}
    </div>
  );
}
