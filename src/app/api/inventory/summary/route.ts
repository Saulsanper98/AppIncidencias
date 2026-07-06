import { NextResponse } from "next/server";

import { isApiAuthError, requireActor } from "@/lib/api-auth";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { getInventorySummary } from "@/lib/inventory";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (isApiAuthError(actor)) return actor;

    await ensureCatalogSeeded();
    const summary = await getInventorySummary();
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Error loading inventory summary:", error);
    return NextResponse.json({ message: "No se pudo cargar el inventario" }, { status: 500 });
  }
}
