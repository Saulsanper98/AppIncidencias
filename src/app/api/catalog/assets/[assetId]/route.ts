import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";

const patchSchema = z.object({
  slaMinutes: z.number().int().min(5).max(10080).nullable(),
});

export async function PATCH(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageCatalog(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para gestionar catálogo" }, { status: 403 });
    }

    const { assetId } = await context.params;
    const payload = await request.json();
    const parsed = patchSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }

    const updated = await prisma.asset.update({
      where: { id: assetId },
      data: { slaMinutes: parsed.data.slaMinutes },
      select: { id: true, busId: true, type: true, serialNumber: true, slaMinutes: true },
    });

    return NextResponse.json({ asset: updated });
  } catch (error) {
    console.error("Error updating asset SLA:", error);
    return NextResponse.json({ message: "No se pudo actualizar el activo" }, { status: 500 });
  }
}
