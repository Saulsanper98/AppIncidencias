/** El dictado por voz requiere contexto seguro (HTTPS o localhost). */
export function isVoiceInputSecureContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext;
}

export function isSpeechRecognitionAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

/** URL HTTPS sugerida para dictado en la LAN (mismo host, puerto configurado). */
export function suggestedHttpsVoiceUrl(httpsPort = "3443"): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  if (window.isSecureContext) return null;
  const path = `${window.location.pathname}${window.location.search}`;
  return `https://${host}:${httpsPort}${path}`;
}

export const VOICE_INSECURE_MESSAGE =
  "El dictado por voz no funciona con HTTP en la red local.";

export function voiceInsecureDescription(httpsPort = "3443"): string {
  const url = suggestedHttpsVoiceUrl(httpsPort);
  if (url) {
    return `Abre la app con ${url} (certificado interno). En Chrome: candado → Configuración del sitio → Micrófono → Permitir.`;
  }
  return "Usa HTTPS o accede por localhost. En Chrome: icono del candado → Micrófono → Permitir.";
}
