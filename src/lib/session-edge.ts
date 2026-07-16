/**
 * Helpers de sesión seguros para Edge Middleware (sin node:crypto).
 * La verificación HMAC completa sigue en `@/lib/session` (Node) y en handlers.
 */

import { SESSION_COOKIE_NAME } from "@/lib/session-constants";

export { SESSION_COOKIE_NAME };

/** Formato `v1.<id-b64url>.<sig-b64url>` — rechaza cookies basura / legacy. */
export function isSessionTokenShape(token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, idEncoded, signature] = parts;
  if (version !== "v1" || !idEncoded || !signature) return false;
  return /^[A-Za-z0-9_-]+$/.test(idEncoded) && /^[A-Za-z0-9_-]+$/.test(signature);
}
