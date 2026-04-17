import { NextResponse } from "next/server";

import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { TIPOLOGIA_CSV } from "@/lib/tipologia";

export async function GET() {
  try {
    await ensureCatalogSeeded();

    const buses = await prisma.bus.findMany({
      include: {
        assets: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    return NextResponse.json({
      buses: buses.map((bus) => ({
        id: bus.id,
        operator: bus.operator,
        municipio: bus.municipio,
        lineas: bus.lineas.split(",").filter(Boolean),
        assets: bus.assets.map((asset) => ({
          id: asset.id,
          type: asset.type,
          serialNumber: asset.serialNumber,
        })),
      })),
      tipologias: TIPOLOGIA_CSV,
    });
  } catch (error) {
    console.error("Error loading catalog:", error);
    return NextResponse.json({ message: "No se pudo cargar el catalogo" }, { status: 500 });
  }
}
