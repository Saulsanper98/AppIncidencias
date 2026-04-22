import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";
import { TIPOLOGIA_CSV } from "@/lib/tipologia";

const createBusSchema = z.object({
  id: z.string().trim().min(3),
  operator: z.string().trim().min(2),
  municipio: z.string().trim().min(2),
  lineas: z.array(z.string().trim().min(1)).min(1),
});

const updateBusSchema = z.object({
  id: z.string().trim().min(1),
  operator: z.string().trim().min(2).optional(),
  municipio: z.string().trim().min(2).optional(),
  lineas: z.array(z.string().trim().min(1)).min(1).optional(),
});

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
          slaMinutes: asset.slaMinutes ?? null,
        })),
      })),
      tipologias: TIPOLOGIA_CSV,
    });
  } catch (error) {
    console.error("Error loading catalog:", error);
    return NextResponse.json({ message: "No se pudo cargar el catalogo" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageCatalog(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para gestionar catálogo" }, { status: 403 });
    }
    const payload = await request.json();
    const parsed = createBusSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }
    const data = parsed.data;
    const defaultAssetId = `${data.id}-SAE-DEFAULT`;
    const created = await prisma.bus.create({
      data: {
        id: data.id,
        operator: data.operator,
        municipio: data.municipio,
        lineas: data.lineas.join(","),
        assets: {
          create: [
            {
              id: defaultAssetId,
              type: "sae",
              serialNumber: `SN-${data.id}-01`,
            },
          ],
        },
      },
      include: { assets: true },
    });
    return NextResponse.json({ bus: created }, { status: 201 });
  } catch (error) {
    console.error("Error creating catalog bus:", error);
    return NextResponse.json({ message: "No se pudo crear el bus" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageCatalog(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para gestionar catálogo" }, { status: 403 });
    }
    const payload = await request.json();
    const parsed = updateBusSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }
    const data = parsed.data;
    const updated = await prisma.bus.update({
      where: { id: data.id },
      data: {
        operator: data.operator,
        municipio: data.municipio,
        lineas: data.lineas ? data.lineas.join(",") : undefined,
      },
    });
    return NextResponse.json({ bus: updated });
  } catch (error) {
    console.error("Error updating catalog bus:", error);
    return NextResponse.json({ message: "No se pudo actualizar el bus" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageCatalog(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para gestionar catálogo" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ message: "Falta id de bus" }, { status: 400 });
    }
    await prisma.bus.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting catalog bus:", error);
    return NextResponse.json({ message: "No se pudo eliminar el bus" }, { status: 500 });
  }
}
