import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { canReviewFeedback } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  status: z.enum(["pendiente", "en_revision", "planificado", "implementado", "descartado"]).optional(),
  adminNotes: z.string().max(1000).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canReviewFeedback(actor.role)) {
      return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 422 });
    }

    const existing = await prisma.userFeedback.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: "Feedback no encontrado" }, { status: 404 });
    }

    const updated = await prisma.userFeedback.update({
      where: { id },
      data: {
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
        ...(parsed.data.adminNotes !== undefined && { adminNotes: parsed.data.adminNotes }),
      },
    });

    return NextResponse.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Error updating feedback:", error);
    return NextResponse.json({ message: "Error al actualizar feedback" }, { status: 500 });
  }
}
