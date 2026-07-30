import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageDashboards } from "@/lib/rbac";

const updateDashboardSchema = z.object({
  name: z.string().trim().min(3),
});

type ParamsContext = {
  params: Promise<{ dashboardId: string }>;
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para ver dashboards" }, { status: 401 });
    }

    const { dashboardId } = await context.params;
    const dashboard = await prisma.customDashboard.findUnique({
      where: { id: dashboardId },
      include: {
        widgets: { orderBy: { order: "asc" } },
      },
    });

    if (!dashboard) {
      return NextResponse.json({ message: "Dashboard no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      dashboard: {
        id: dashboard.id,
        name: dashboard.name,
        createdAt: dashboard.createdAt.toISOString(),
        updatedAt: dashboard.updatedAt.toISOString(),
        createdByUserId: dashboard.createdByUserId,
        widgets: dashboard.widgets.map((widget) => ({
          id: widget.id,
          dashboardId: widget.dashboardId,
          title: widget.title,
          chartType: widget.chartType,
          dataSource: widget.dataSource,
          size: widget.size,
          order: widget.order,
          config: widget.config,
          createdAt: widget.createdAt.toISOString(),
          updatedAt: widget.updatedAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    return NextResponse.json({ message: "No se pudo cargar el dashboard" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para editar dashboards" }, { status: 401 });
    }
    if (!canManageDashboards(actor.role)) {
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
    if (!canManageDashboards(actor.role)) {
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
