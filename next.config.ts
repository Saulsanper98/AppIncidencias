import type { NextConfig } from "next";

import pkg from "./package.json";

/**
 * Orígenes extra para embeber la app en iframe (p. ej. DataWall Display por IP de red).
 * Lista separada por comas de URLs base (solo http/https), p. ej.:
 * DATAWALL_FRAME_ANCESTOR_ORIGINS="http://192.168.1.50:5174"
 */
function extraFrameAncestorsFromEnv(): string[] {
  const raw = process.env.DATAWALL_FRAME_ANCESTOR_ORIGINS;
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      out.push(u.origin);
    } catch {
      /* ignorar valor inválido */
    }
  }
  return [...new Set(out)];
}

const dataWallDisplayOrigins = [
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  ...extraFrameAncestorsFromEnv(),
];

const frameAncestorsCsp = [
  "'self'",
  ...dataWallDisplayOrigins,
].join(" ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: `frame-ancestors ${frameAncestorsCsp}`,
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_DEPLOY_ENV: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
