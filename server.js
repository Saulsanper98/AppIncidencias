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
 *   RATE_LIMIT_GENERAL_RPM      → req/min sostenidas por IP (def. 360).
 *   RATE_LIMIT_GENERAL_BURST    → tokens máximos del bucket (def. 80).
 *   RATE_LIMIT_LOGIN_RPM        → req/min para endpoints sensibles (def. 20).
 *   RATE_LIMIT_LOGIN_BURST      → burst sensible (def. 6).
 *   RATE_LIMIT_BAN_THRESHOLD    → nº de 429 en 60s que dispara ban (def. 150).
 *   RATE_LIMIT_BAN_MINUTES      → duración del ban (def. 15).
 *   RATE_LIMIT_TRUST_PROXY      → "1" lee x-forwarded-for (solo detrás de
 *                                  un reverse proxy de confianza).
 *   RATE_LIMIT_WHITELIST        → CSV de IPs/CIDRs exentas (def. "127.0.0.1,::1").
 *   RATE_LIMIT_TRUST_LAN        → "1" exime redes privadas (192.168/10/172.16).
 *
 * Si necesitas tunearlo en caliente, ajusta el .env y reinicia el servicio:
 *   Restart-Service CCMGCTicketing
 */

"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { parse } = require("node:url");
const next = require("next");

/** Carga `.env` antes de leer RATE_LIMIT_* (NSSM no incluye todas las vars). */
function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile();

// ───────────────────────── Configuración entorno ─────────────────────────

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const httpsPort = parseInt(process.env.HTTPS_PORT || "3443", 10);

function loadTlsOptions() {
  const pfxPath = process.env.TLS_PFX_PATH;
  if (pfxPath) {
    const resolved = path.isAbsolute(pfxPath) ? pfxPath : path.join(process.cwd(), pfxPath);
    if (!fs.existsSync(resolved)) {
      console.warn(`[tls] No existe TLS_PFX_PATH: ${resolved}`);
      return null;
    }
    return {
      pfx: fs.readFileSync(resolved),
      passphrase: process.env.TLS_PFX_PASSPHRASE || "",
    };
  }

  const keyPath = process.env.TLS_KEY_PATH;
  const certPath = process.env.TLS_CERT_PATH;
  if (keyPath && certPath) {
    const resolvedKey = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
    const resolvedCert = path.isAbsolute(certPath) ? certPath : path.join(process.cwd(), certPath);
    if (!fs.existsSync(resolvedKey) || !fs.existsSync(resolvedCert)) {
      console.warn("[tls] TLS_KEY_PATH o TLS_CERT_PATH no encontrados.");
      return null;
    }
    return {
      key: fs.readFileSync(resolvedKey),
      cert: fs.readFileSync(resolvedCert),
    };
  }

  return null;
}

function attachServerTimeouts(server) {
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 30_000;
}

const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_DISABLE !== "1";
const GEN_RPM = parseInt(process.env.RATE_LIMIT_GENERAL_RPM || "360", 10);
const GEN_BURST = parseInt(process.env.RATE_LIMIT_GENERAL_BURST || "80", 10);
const LOGIN_RPM = parseInt(process.env.RATE_LIMIT_LOGIN_RPM || "20", 10);
const LOGIN_BURST = parseInt(process.env.RATE_LIMIT_LOGIN_BURST || "6", 10);
const BAN_THRESHOLD = parseInt(process.env.RATE_LIMIT_BAN_THRESHOLD || "150", 10);
const BAN_MS = parseInt(process.env.RATE_LIMIT_BAN_MINUTES || "15", 10) * 60_000;
const TRUST_PROXY = process.env.RATE_LIMIT_TRUST_PROXY === "1";
const TRUST_LAN = process.env.RATE_LIMIT_TRUST_LAN === "1";
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

/** RFC1918 + loopback: uso interno en LAN corporativa. */
function isPrivateLanIp(ip) {
  const n = normalizeIp(ip);
  if (n === "127.0.0.1") return true;
  const parts = n.split(".").map((x) => parseInt(x, 10));
  if (parts.length !== 4 || parts.some((x) => Number.isNaN(x) || x < 0 || x > 255)) {
    return false;
  }
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isWhitelistedIp(ip) {
  const n = normalizeIp(ip);
  if (WHITELIST.has(n)) return true;
  if (TRUST_LAN && isPrivateLanIp(n)) return true;
  return false;
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

// Rutas de lectura frecuente que NO deben consumir el bucket estricto de login.
// En cada carga de página varios componentes (layout, sidebar, tabs, tickets)
// llaman GET /api/auth/session en paralelo; tratarla como "login" provocaba
// 429 en uso normal y cascadas de error React (#418) al fallar la sesión.
function isRateLimitExempt(pathname, method) {
  if (!pathname) return false;
  const m = (method || "GET").toUpperCase();
  if (pathname === "/api/auth/session" && m === "GET") return true;
  if (pathname === "/api/auth/preferences" && m === "GET") return true;
  if (pathname === "/api/notifications/stream") return true;
  if (pathname === "/api/notifications/list" && m === "GET") return true;
  if (pathname === "/api/reports/daily/today" && m === "GET") return true;
  if (pathname === "/api/reports/daily/month" && m === "GET") return true;
  if (pathname === "/api/users" && m === "GET") return true;
  if (pathname === "/api/ux/events" && m === "POST") return true;
  if (pathname === "/api/tickets/drafts-badge" && m === "GET") return true;
  if (pathname === "/api/announcements/badge" && m === "GET") return true;
  if (pathname.startsWith("/api/tickets") && m === "GET") return true;
  return false;
}

// Rutas sensibles: límite estricto adicional (solo mutaciones de auth).
function isSensitiveRoute(pathname, method) {
  if (!pathname) return false;
  const m = (method || "GET").toUpperCase();
  if (m !== "POST" && m !== "DELETE") return false;
  return (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/session" ||
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
    pathname.startsWith("/api/kb/media/") ||
    pathname.startsWith("/_next/") ||
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
    const requestListener = (req, res) => {
      // Nunca dejamos que un error en el rate limit tumbe la app.
      try {
        const ip = getClientIp(req);
        const parsed = parse(req.url || "/", true);
        const pathname = parsed.pathname || "/";

        // Inyectamos siempre x-real-ip para que el middleware y los route
        // handlers puedan auditar la IP real (incluso si TRUST_PROXY=0).
        req.headers["x-real-ip"] = ip;

        if (
          RATE_LIMIT_ENABLED &&
          !isWhitelistedIp(ip) &&
          !isStaticAsset(pathname) &&
          !isRateLimitExempt(pathname, req.method)
        ) {
          const banUntil = isBanned(ip);
          if (banUntil) {
            return reply429(res, banUntil - Date.now(), "banned");
          }

          const passGeneral = generalLimiter.consume(ip);
          const passSensitive =
            !isSensitiveRoute(pathname, req.method) || loginLimiter.consume(ip);

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
    };

    const server = http.createServer(requestListener);

    server.on("clientError", (err, socket) => {
      // hey y similares cierran sockets a medias: evita warnings ruidosos.
      try {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      } catch {
        /* socket ya cerrado */
      }
    });

    attachServerTimeouts(server);

    server.listen(port, hostname, () => {
      console.log(
        `> Listo en http://${hostname}:${port} (NODE_ENV=${process.env.NODE_ENV}, rate-limit=${RATE_LIMIT_ENABLED ? "ON" : "OFF"})`,
      );
      if (RATE_LIMIT_ENABLED) {
        console.log(
          `  [rate-limit] general=${GEN_RPM}rpm burst=${GEN_BURST} | sensible=${LOGIN_RPM}rpm burst=${LOGIN_BURST} | ban_threshold=${BAN_THRESHOLD}/min ban_dur=${BAN_MS / 60000}min | trust_proxy=${TRUST_PROXY} | trust_lan=${TRUST_LAN} | whitelist=[${[...WHITELIST].join(",")}]`,
        );
      }

      const tlsOptions = loadTlsOptions();
      if (tlsOptions) {
        const httpsServer = https.createServer(tlsOptions, requestListener);
        httpsServer.on("clientError", (err, socket) => {
          try {
            socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
          } catch {
            /* socket ya cerrado */
          }
        });
        attachServerTimeouts(httpsServer);
        httpsServer.listen(httpsPort, hostname, () => {
          console.log(
            `> HTTPS listo en https://0.0.0.0:${httpsPort} (dictado por voz y micrófono requieren esta URL en la LAN)`,
          );
        });
      } else {
        console.log(
          "  [tls] Sin certificado (TLS_PFX_PATH). El dictado por voz en http://IP no funcionará; ejecuta scripts/setup-local-https.ps1",
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
