import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

const updateDashboardSchema = z.object({
  name: z.string().trim().min(3),
});

type ParamsContext = {
  params: Promise<{ dashboardId: string }>;
};

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para editar dashboards" }, { status: 401 });
    }
    if (actor.role !== "gestor_centro_control") {
      return NextResponse.json({ message: "Rol sin permisos para editar dashboards" }, { status: 403 });
    }

    const { dashboardId } = await context.params;
    const payload = await request.json();
    const parsed = updateDashboardSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Nombre de dashboard invalido" }, { status: 400 });
    }

    const dashboard = await prisma.customDashboard.update({
      where: { id: dashboardId },
      data: { name: parsed.data.name },
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "dashboard.updated",
      detail: `${actor.displayName} actualizo dashboard ${dashboard.id}`,
    });

    return NextResponse.json({
      dashboard: {
        id: dashboard.id,
        name: dashboard.name,
        createdAt: dashboard.createdAt.toISOString(),
        updatedAt: dashboard.updatedAt.toISOString(),
        createdByUserId: dashboard.createdByUserId,
      },
    });
  } catch (error) {
    console.error("Error updating dashboard:", error);
    return NextResponse.json({ message: "No se pudo actualizar el dashboard" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: ParamsContext) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para borrar dashboards" }, { status: 401 });
    }
    if (actor.role !== "gestor_centro_control") {
      return NextResponse.json({ message: "Rol sin permisos para borrar dashboards" }, { status: 403 });
    }

    const { dashboardId } = await context.params;
    const dashboard = await prisma.customDashboard.delete({
      where: { id: dashboardId },
      select: { id: true, name: true },
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "dashboard.deleted",
      detail: `${actor.displayName} elimino dashboard ${dashboard.id} (${dashboard.name})`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting dashboard:", error);
    return NextResponse.json({ message: "No se pudo borrar el dashboard" }, { status: 500 });
  }
}
