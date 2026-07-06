/** Preferencia usuario: forzar reducir animaciones (Ola 4 #540). */

const STORAGE_KEY = "ccmgc-reduce-motion";

export function isReduceMotionForced(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setReduceMotionForced(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  syncReduceMotionDom();
}

/** Aplica `data-reduce-motion` en `<html>` para CSS global. */
export function syncReduceMotionDom(): void {
  if (typeof document === "undefined") return;
  const enabled = isReduceMotionForced();
  if (enabled) document.documentElement.setAttribute("data-reduce-motion", "true");
  else document.documentElement.removeAttribute("data-reduce-motion");
}
