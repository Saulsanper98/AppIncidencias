import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { normalizeMunicipioLabel } from "@/lib/gran-canaria-map-geo";

let lastServerCall = 0;

type NominatimAddr = Record<string, string>;

function pickPlaceName(addr: NominatimAddr): string {
  const raw =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.hamlet ||
    addr.municipality ||
    addr.suburb ||
    addr.county ||
    "";
  return raw.trim();
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Sesion requerida" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ message: "lat y lng numericos requeridos" }, { status: 400 });
    }

    const now = Date.now();
    if (now - lastServerCall < 1100) {
      return NextResponse.json({ message: "Espera un momento.", municipio: null }, { status: 429 });
    }
    lastServerCall = now;

    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("zoom", "12");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "CCMGC-Ticketing/1.0 (mapa interno; contacto: soporte interno)",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return NextResponse.json({ municipio: null }, { status: 200 });
    }

    const data = (await res.json()) as { address?: NominatimAddr; display_name?: string };
    const addr = data.address ?? {};
    let label = pickPlaceName(addr);
    if (!label && data.display_name) {
      label = data.display_name.split(",")[0]?.trim() ?? "";
    }
    if (!label) {
      return NextResponse.json({ municipio: null });
    }

    const normalized = normalizeMunicipioLabel(label);
    return NextResponse.json({ municipio: normalized });
  } catch {
    return NextResponse.json({ municipio: null }, { status: 200 });
  }
}
