/** P7: pitido opcional (kiosko / demos). Respeta `prefers-reduced-motion`. */
export function playOptionalLoginSuccessChime(): void {
  if (typeof window === "undefined") return;
  if (process.env.NEXT_PUBLIC_LOGIN_SUCCESS_SOUND !== "1") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 523.25;
    gain.gain.value = 0.035;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
    void ctx.close();
  } catch {
    /* ignore */
  }
}
