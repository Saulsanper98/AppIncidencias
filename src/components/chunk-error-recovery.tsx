"use client";

import { useEffect } from "react";

const RELOAD_KEY = "ccmgc:chunk-reload-once";
const RELOAD_DELAY_MS = 800;

function isChunkLoadError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("chunkloaderror") ||
    m.includes("loading chunk") ||
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("importing a module script failed")
  );
}

function scheduleSoftReload(reason: string): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    /* sessionStorage bloqueado */
  }
  console.warn("[chunk-recovery] Recargando tras deploy:", reason);
  window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
}

/**
 * Tras un deploy, los chunks antiguos en caché provocan ChunkLoadError.
 * Un reload suave (una vez por pestaña) restaura la sesión sin intervención.
 */
export function ChunkErrorRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const msg = event.message || String(event.error ?? "");
      if (isChunkLoadError(msg)) scheduleSoftReload(msg);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "";
      if (isChunkLoadError(msg)) scheduleSoftReload(msg);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
