import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageDashboards } from "@/lib/rbac";

type ParamsContext = {
  params: Promise<{ dashboardId: string }>;
};

/** Duplica un panel y todos sus widgets. */
export async function POST(request: Request, context: ParamsContext) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para duplicar dashboards" }, { status: 401 });
    }
    if (!canManageDashboards(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para duplicar dashboards" }, { status: 403 });
    }

    const { dashboardId } = await context.params;
    const original = await prisma.customDashboard.findUnique({
      where: { id: dashboardId },
      include: { widgets: { orderBy: { order: "asc" } } },
    });

    if (!original) {
      return NextResponse.json({ message: "Dashboard no encontrado" }, { status: 404 });
    }

    const dashboard = await prisma.$transaction(async (tx) => {
      const created = await tx.customDashboard.create({
        data: {
          name: `${original.name} (copia)`,
          createdByUserId: actor.userId,
        },
      });

      if (original.widgets.length > 0) {
        await tx.dashboardWidget.createMany({
          data: original.widgets.map((widget) => ({
            dashboardId: created.id,
            title: widget.title,
            chartType: widget.chartType,
            dataSource: widget.dataSource,
            size: widget.size,
            order: widget.order,
            config: widget.config,
          })),
        });
      }

      return created;
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "dashboard.created",
      detail: `${actor.displayName} duplico dashboard ${original.id} → ${dashboard.id}`,
    });

    return NextResponse.json(
      {
        dashboard: {
          id: dashboard.id,
          name: dashboard.name,
          createdAt: dashboard.createdAt.toISOString(),
          updatedAt: dashboard.updatedAt.toISOString(),
          createdByUserId: dashboard.createdByUserId,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error duplicating dashboard:", error);
    return NextResponse.json({ message: "No se pudo duplicar el dashboard" }, { status: 500 });
  }
}
