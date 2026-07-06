"use client";

import { useEffect } from "react";

const SW_URL = "/sw.js";

/**
 * Registra el SW y fuerza actualización tras cada despliegue.
 * Si hay un SW nuevo activo, recarga una vez para evitar HTML/chunks mezclados.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloaded = false;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register(SW_URL, {
          scope: "/",
          updateViaCache: "none",
        });

        await reg.update();

        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state !== "activated") return;
            if (!navigator.serviceWorker.controller || reloaded) return;
            reloaded = true;
            window.location.reload();
          });
        });

        if (reg.waiting && navigator.serviceWorker.controller) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      } catch {
        /* ignore — PWA opcional */
      }
    };

    void register();
  }, []);

  return null;
}
