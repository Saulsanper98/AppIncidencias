/**
 * Servidor HTTP custom que envuelve Next.js y aplica:
 *   1. Rate limiting por IP (token bucket en memoria).
 *   2. Auto-ban temporal de IPs que abusan del 429.
 *   3. Inyección de cabecera `x-real-ip` para que el middleware/route handlers
 *      puedan identificar la IP cliente real.
 *
 * Diseñado para sustituir el `next start` directo que ejecutaba el servicio
 * NSSM en `scripts/install-service.ps1`. Mantiene el mismo contrato de
 * variables de entorno (HOST/PORT/NODE_ENV) y añade unas nuevas opcionales:
 *
 *   RATE_LIMIT_DISABLE          → "1" desactiva el rate limit (no recomendado).
 *   RATE_LIMIT_GENERAL_RPM      → req/min sostenidas por IP (def. 240).
 *   RATE_LIMIT_GENERAL_BURST    → tokens máximos del bucket (def. 60).
 *   RATE_LIMIT_LOGIN_RPM        → req/min para endpoints sensibles (def. 20).
 *   RATE_LIMIT_LOGIN_BURST      → burst sensible (def. 6).
 *   RATE_LIMIT_BAN_THRESHOLD    → nº de 429 en 60s que dispara ban (def. 150).
 *   RATE_LIMIT_BAN_MINUTES      → duración del ban (def. 15).
 *   RATE_LIMIT_TRUST_PROXY      → "1" lee x-forwarded-for (solo detrás de
 *                                  un reverse proxy de confianza).
 *   RATE_LIMIT_WHITELIST        → CSV de IPs/CIDRs exentas (def. "127.0.0.1,::1").
 *
 * Si necesitas tunearlo en caliente, ajusta el .env y reinicia el servicio:
 *   Restart-Service CCMGCTicketing
 */

"use strict";

const http = require("node:http");
const { parse } = require("node:url");
const next = require("next");

// ───────────────────────── Configuración entorno ─────────────────────────

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_DISABLE !== "1";
const GEN_RPM = parseInt(process.env.RATE_LIMIT_GENERAL_RPM || "240", 10);
const GEN_BURST = parseInt(process.env.RATE_LIMIT_GENERAL_BURST || "60", 10);
const LOGIN_RPM = parseInt(process.env.RATE_LIMIT_LOGIN_RPM || "20", 10);
const LOGIN_BURST = parseInt(process.env.RATE_LIMIT_LOGIN_BURST || "6", 10);
const BAN_THRESHOLD = parseInt(process.env.RATE_LIMIT_BAN_THRESHOLD || "150", 10);
const BAN_MS = parseInt(process.env.RATE_LIMIT_BAN_MINUTES || "15", 10) * 60_000;
const TRUST_PROXY = process.env.RATE_LIMIT_TRUST_PROXY === "1";
const WHITELIST = new Set(
  (process.env.RATE_LIMIT_WHITELIST !== undefined
    ? process.env.RATE_LIMIT_WHITELIST
    : "127.0.0.1,::1"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

// ───────────────────────── Rate limiter (token bucket) ─────────────────────────

class TokenBucketLimiter {
  /**
   * @param {object} opts
   * @param {number} opts.capacity  - tokens máximos (burst).
   * @param {number} opts.refillPerSec - tokens reabastecidos por segundo.
   */
  constructor({ capacity, refillPerSec }) {
    this.capacity = capacity;
    this.refill = refillPerSec;
    /** @type {Map<string, {tokens:number,last:number}>} */
    this.buckets = new Map();
  }

  /** Intenta consumir 1 token. Devuelve true si pasa, false si toca limitar. */
  consume(key) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, last: now };
      this.buckets.set(key, b);
    } else {
      const elapsedSec = (now - b.last) / 1000;
      b.tokens = Math.min(this.capacity, b.tokens + elapsedSec * this.refill);
      b.last = now;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Limpia buckets sin actividad reciente (libera memoria). */
  sweep() {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [k, b] of this.buckets) {
      if (b.last < cutoff) this.buckets.delete(k);
    }
  }
}

const generalLimiter = new TokenBucketLimiter({
  capacity: GEN_BURST,
  refillPerSec: GEN_RPM / 60,
});
const loginLimiter = new TokenBucketLimiter({
  capacity: LOGIN_BURST,
  refillPerSec: LOGIN_RPM / 60,
});

// ───────────────────────── Auto-ban por strikes ─────────────────────────

/** @type {Map<string, number>} ip → timestamp ms hasta el que está baneada */
const bans = new Map();
/** @type {Map<string, {count:number, windowStart:number}>} */
const strikes = new Map();

function isBanned(ip) {
  const until = bans.get(ip);
  if (!until) return 0;
  if (until > Date.now()) return until;
  bans.delete(ip);
  return 0;
}

function strike(ip) {
  const now = Date.now();
  let s = strikes.get(ip);
  if (!s || now - s.windowStart > 60_000) {
    s = { count: 0, windowStart: now };
    strikes.set(ip, s);
  }
  s.count++;
  if (s.count >= BAN_THRESHOLD && !bans.has(ip)) {
    const until = now + BAN_MS;
    bans.set(ip, until);
    console.warn(
      `[rate-limit] BAN ip=${ip} hits=${s.count} until=${new Date(until).toISOString()}`,
    );
  }
}

setInterval(() => {
  generalLimiter.sweep();
  loginLimiter.sweep();
  const now = Date.now();
  for (const [ip, until] of bans) if (until <= now) bans.delete(ip);
  for (const [ip, s] of strikes) if (now - s.windowStart > 5 * 60_000) strikes.delete(ip);
}, 60_000).unref();

// ───────────────────────── Helpers IP ─────────────────────────

function normalizeIp(ip) {
  if (!ip) return "0.0.0.0";
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) → IPv4.
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

function getClientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers["x-forwarded-for"];
    if (xff) {
      const first = String(xff).split(",")[0].trim();
      if (first) return normalizeIp(first);
    }
    const xrip = req.headers["x-real-ip"];
    if (xrip) return normalizeIp(String(xrip));
  }
  return normalizeIp(req.socket && req.socket.remoteAddress);
}

// Rutas más sensibles: aplican el límite estricto adicional.
function isSensitiveRoute(pathname) {
  if (!pathname) return false;
  return (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/users/reset-password") ||
    pathname.startsWith("/api/users/forgot-password")
  );
}

// Rutas a las que NUNCA aplicamos rate limit (assets estáticos del propio Next).
// El servidor de assets de Next puede mover muchísimas peticiones al cargar la
// página y romper el bucket de un usuario legítimo.
function isStaticAsset(pathname) {
  if (!pathname) return false;
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/robots.txt"
  );
}

// ───────────────────────── Servidor ─────────────────────────

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      // Nunca dejamos que un error en el rate limit tumbe la app.
      try {
        const ip = getClientIp(req);
        const parsed = parse(req.url || "/", true);
        const pathname = parsed.pathname || "/";

        // Inyectamos siempre x-real-ip para que el middleware y los route
        // handlers puedan auditar la IP real (incluso si TRUST_PROXY=0).
        req.headers["x-real-ip"] = ip;

        if (RATE_LIMIT_ENABLED && !WHITELIST.has(ip) && !isStaticAsset(pathname)) {
          const banUntil = isBanned(ip);
          if (banUntil) {
            return reply429(res, banUntil - Date.now(), "banned");
          }

          const passGeneral = generalLimiter.consume(ip);
          const passSensitive =
            !isSensitiveRoute(pathname) || loginLimiter.consume(ip);

          if (!passGeneral || !passSensitive) {
            strike(ip);
            // Log compacto, solo 1 línea por strike (para no llenar el log)
            if (strikes.get(ip)?.count % 25 === 1) {
              console.warn(
                `[rate-limit] 429 ip=${ip} path=${pathname} strikes=${strikes.get(ip)?.count}`,
              );
            }
            return reply429(res, 60_000, passGeneral ? "login" : "general");
          }
        }

        return handler(req, res, parsed);
      } catch (err) {
        console.error("[server] handler error:", err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ message: "Internal server error" }));
        }
      }
    });

    server.on("clientError", (err, socket) => {
      // hey y similares cierran sockets a medias: evita warnings ruidosos.
      try {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      } catch {
        /* socket ya cerrado */
      }
    });

    // Endurecimiento de timeouts: si el atacante deja conexiones abiertas sin
    // mandar bytes, las cortamos para liberar el pool.
    server.headersTimeout = 15_000;
    server.requestTimeout = 30_000;
    server.keepAliveTimeout = 30_000;

    server.listen(port, hostname, () => {
      console.log(
        `> Listo en http://${hostname}:${port} (NODE_ENV=${process.env.NODE_ENV}, rate-limit=${RATE_LIMIT_ENABLED ? "ON" : "OFF"})`,
      );
      if (RATE_LIMIT_ENABLED) {
        console.log(
          `  [rate-limit] general=${GEN_RPM}rpm burst=${GEN_BURST} | sensible=${LOGIN_RPM}rpm burst=${LOGIN_BURST} | ban_threshold=${BAN_THRESHOLD}/min ban_dur=${BAN_MS / 60000}min | trust_proxy=${TRUST_PROXY} | whitelist=[${[...WHITELIST].join(",")}]`,
        );
      }
    });
  })
  .catch((err) => {
    console.error("Fallo al preparar Next:", err);
    process.exit(1);
  });

function reply429(res, retryAfterMs, reason) {
  if (res.headersSent) return;
  const retrySec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  res.statusCode = 429;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Retry-After", String(retrySec));
  res.setHeader("X-RateLimit-Reason", reason);
  res.end(
    JSON.stringify({
      message:
        "Demasiadas peticiones desde tu IP. Espera unos segundos y vuelve a intentarlo.",
      retryAfterSeconds: retrySec,
    }),
  );
}
