/**
 * Sonido UI opt-in (w30). Silenciado con prefers-reduced-motion o preferencia usuario.
 */
const STORAGE_KEY = "ccmgc:ui-chime-enabled";

export function isUiChimeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setUiChimeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function playUiChime(type: "success" | "error" = "success"): void {
  if (!isUiChimeEnabled()) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === "success" ? 880 : 220;
    gain.gain.value = 0.04;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (type === "success" ? 0.12 : 0.18));
    osc.stop(ctx.currentTime + 0.2);
    window.setTimeout(() => void ctx.close(), 300);
  } catch {
    /* ignore */
  }
}
