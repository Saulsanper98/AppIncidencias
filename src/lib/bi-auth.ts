import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

const ENV_KEY = "POWER_BI_API_KEY";

export function getPowerBiApiKey(): string | null {
  const value = process.env[ENV_KEY]?.trim();
  return value || null;
}

function safeEqualToken(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function extractPowerBiToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    return token || null;
  }
  const header = request.headers.get("x-power-bi-key")?.trim();
  return header || null;
}

export function verifyPowerBiRequest(request: Request): boolean {
  const expected = getPowerBiApiKey();
  if (!expected) return false;
  const provided = extractPowerBiToken(request);
  if (!provided) return false;
  return safeEqualToken(provided, expected);
}

/** Devuelve respuesta de error o `null` si la petición está autorizada. */
export function requirePowerBiAuth(request: Request): NextResponse | null {
  if (!getPowerBiApiKey()) {
    return NextResponse.json(
      { message: `${ENV_KEY} no configurada en el servidor` },
      { status: 503 },
    );
  }
  if (!verifyPowerBiRequest(request)) {
    return NextResponse.json({ message: "API key inválida o ausente" }, { status: 401 });
  }
  return null;
}
