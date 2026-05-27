import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "ccmgc_user";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

/**
 * Atributos de la cookie de sesión. `secure` debe ser explícito:
 *   - HTTPS detrás de un reverse-proxy → SESSION_COOKIE_SECURE=1 en `.env`.
 *   - HTTP plano (LAN interna sin TLS) → SESSION_COOKIE_SECURE=0 o sin definir.
 * Si se marcase `secure` en HTTP, el navegador descarta la cookie y el usuario
 * "no consigue iniciar sesión" aunque las credenciales sean correctas.
 */
export function buildSessionCookieOptions() {
  const flag = (process.env.SESSION_COOKIE_SECURE ?? "").trim().toLowerCase();
  const secure = flag === "1" || flag === "true" || flag === "yes";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Cookie de borrado: misma firma que la cookie real pero maxAge=0 y valor vacío. */
export function buildSessionDeleteCookieOptions() {
  return { ...buildSessionCookieOptions(), maxAge: 0 };
}

/**
 * Devuelve el secret HMAC con el que firmamos las cookies de sesión.
 * En producción es obligatorio que `SESSION_SECRET` esté definido en `.env`.
 * En desarrollo o tests permitimos un fallback DERIVADO automáticamente del
 * hostname y de algún valor estable para que el flujo dev no se rompa
 * (aunque no es criptográficamente fuerte).
 */
function readSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    // Lanzamos al primer intento de firmar/verificar para forzar a poner el secret.
    throw new Error(
      "SESSION_SECRET no está definido. Añade SESSION_SECRET=<cadena aleatoria larga> al fichero .env y reinicia el servicio.",
    );
  }

  return "dev-only-insecure-session-secret-please-override";
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function sign(payload: string): string {
  const h = createHmac("sha256", readSessionSecret());
  h.update(payload);
  return base64UrlEncode(h.digest());
}

/**
 * Firma un userId para colocarlo en la cookie de sesión.
 * Formato: `v1.<userId-b64url>.<signature-b64url>`.
 */
export function signSessionToken(userId: string): string {
  const id = base64UrlEncode(Buffer.from(userId, "utf8"));
  const sig = sign(`v1.${id}`);
  return `v1.${id}.${sig}`;
}

/**
 * Verifica un token de sesión y devuelve el userId si la firma es válida.
 * Devuelve `null` si:
 *  - el token está malformado,
 *  - la firma no coincide,
 *  - viene del formato antiguo sin firma (rechazamos para evitar suplantación).
 */
export function verifySessionToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [version, idEncoded, signatureProvided] = parts;
  if (version !== "v1" || !idEncoded || !signatureProvided) return null;

  const expectedSig = sign(`v1.${idEncoded}`);
  const a = Buffer.from(expectedSig, "utf8");
  const b = Buffer.from(signatureProvided, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  try {
    return base64UrlDecode(idEncoded).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Helper para generar un secret aleatorio cuando se inicializa un despliegue.
 * No se usa en runtime; el script `create-admin` lo invoca como conveniencia.
 */
export function generateSessionSecret(byteLength = 48): string {
  return base64UrlEncode(randomBytes(byteLength));
}
