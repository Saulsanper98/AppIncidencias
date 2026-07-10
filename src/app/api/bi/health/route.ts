import { NextResponse } from "next/server";

import { getPowerBiApiKey, requirePowerBiAuth } from "@/lib/bi-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bi/health — comprueba token y disponibilidad del módulo BI. */
export async function GET(request: Request) {
  const authError = requirePowerBiAuth(request);
  if (authError) return authError;

  return NextResponse.json({
    ok: true,
    configured: Boolean(getPowerBiApiKey()),
    endpoints: ["/api/bi/tickets", "/api/bi/flota", "/api/bi/kpis"],
  });
}
