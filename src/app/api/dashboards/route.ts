import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageDashboards } from "@/lib/rbac";

const createDashboardSchema = z.object({
  name: z.string().trim().min(3),
});

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para ver dashboards" }, { status: 401 });
    }

    const dashboards = await prisma.customDashboard.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        widgets: {
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json({
      dashboards: dashboards.map((dashboard) => ({
        id: dashboard.id,
        name: dashboard.name,
        createdAt: dashboard.createdAt.toISOString(),
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
      })),
    });
  } catch (error) {
    console.error("Error loading dashboards:", error);
    return NextResponse.json({ message: "No se pudieron cargar los dashboards" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para crear dashboards" }, { status: 401 });
    }
    if (!canManageDashboards(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para crear dashboards" }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = createDashboardSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Nombre de dashboard invalido" }, { status: 400 });
    }

    const dashboard = await prisma.customDashboard.create({
      data: {
        name: parsed.data.name,
        createdByUserId: actor.userId,
      },
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "dashboard.created",
      detail: `${actor.displayName} creo dashboard ${dashboard.name}`,
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
    console.error("Error creating dashboard:", error);
    return NextResponse.json({ message: "No se pudo crear el dashboard" }, { status: 500 });
  }
}
