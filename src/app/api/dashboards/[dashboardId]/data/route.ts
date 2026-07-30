import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import {
  fetchCustomDashboardData,
  filterDashboardDataBySources,
} from "@/lib/dashboard/fetch-dashboard-data";
import { ALL_DATA_SOURCES } from "@/lib/dashboard/data-sources";

function clampDays(raw: string | null): number {
  const n = Number.parseInt(raw ?? "7", 10);
  if (!Number.isFinite(n)) return 7;
  return Math.min(90, Math.max(1, n));
}

function parseSources(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  const allowed = new Set<string>(ALL_DATA_SOURCES);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => allowed.has(s));
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para ver datos de dashboard" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = clampDays(searchParams.get("days"));
    const sources = parseSources(searchParams.get("sources"));
    const payload = await fetchCustomDashboardData(days);
    const body = sources.length > 0 ? filterDashboardDataBySources(payload, sources) : payload;

    return NextResponse.json(body);
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    return NextResponse.json({ message: "No se pudieron cargar los datos del dashboard" }, { status: 500 });
  }
}
