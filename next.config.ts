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
    value: "camera=(), microphone=(self), geolocation=(self)",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.12.67"],
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_DEPLOY_ENV: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    NEXT_PUBLIC_HTTPS_PORT: process.env.HTTPS_PORT ?? "3443",
  },
  // Modulos nativos / con worker_threads / con WASM que NUNCA queremos que Next
  // empaquete. Si los bundleamos:
  //   - tesseract.js arranca worker_threads desde rutas relativas a __dirname y
  //     al perder el __dirname original no encuentra el worker-script.
  //   - pdfjs-dist necesita resolver su worker .mjs por require.resolve.
  //   - @napi-rs/canvas es .node nativo (no puede empaquetarse en JS).
  //   - pdf-parse tiene dependencias optativas (canvas) que rompen el build.
  serverExternalPackages: [
    "tesseract.js",
    "tesseract.js-core",
    "pdfjs-dist",
    "pdf-parse",
    "@napi-rs/canvas",
    "imapflow",
    "mailparser",
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      const prev = config.externals;
      config.externals = [
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
        ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
          if (request?.startsWith("node:")) {
            callback(null, `commonjs ${request}`);
            return;
          }
          callback();
        },
      ];
    }
    return config;
  },
  // En el build del servidor de produccion no queremos que warnings de ESLint
  // (variables no usadas, console.log, etc.) tumben el despliegue. ESLint se
  // sigue ejecutando manualmente con `npm run lint` en desarrollo.
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [
          ...securityHeaders,
          // Evita HTML obsoleto que apunta a chunks que ya no existen tras deploy.
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
