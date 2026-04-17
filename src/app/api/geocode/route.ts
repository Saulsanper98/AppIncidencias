import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";

type NominatimHit = {
  display_name: string;
  lat: string;
  lon: string;
};

/** Nominatim: min lon, max lat, max lon, min lat (Gran Canaria aprox.) */
const VIEWBOX = "-15.92,28.18,-15.35,27.72";

let lastServerCall = 0;

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Sesion requerida" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ results: [] as { label: string; lat: number; lng: number }[] });
    }

    const now = Date.now();
    if (now - lastServerCall < 1100) {
      return NextResponse.json(
        { message: "Espera un momento entre búsquedas.", results: [] },
        { status: 429 },
      );
    }
    lastServerCall = now;

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "6");
    url.searchParams.set("countrycodes", "es");
    url.searchParams.set("viewbox", VIEWBOX);
    url.searchParams.set("bounded", "1");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "CCMGC-Ticketing/1.0 (mapa interno; contacto: soporte interno)",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { message: "Geocodificador no disponible.", results: [] },
        { status: 502 },
      );
    }

    const data = (await res.json()) as NominatimHit[];
    const results = (Array.isArray(data) ? data : []).map((row) => ({
      label: row.display_name,
      lat: Number(row.lat),
      lng: Number(row.lon),
    })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ message: "Error al geocodificar.", results: [] }, { status: 500 });
  }
}
