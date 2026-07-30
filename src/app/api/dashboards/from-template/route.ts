import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboard/templates";
import { prisma } from "@/lib/prisma";
import { canManageDashboards } from "@/lib/rbac";

const fromTemplateSchema = z.object({
  templateId: z.string().min(1),
});

/** Crea un dashboard completo desde plantilla en una sola transacción. */
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
    const parsed = fromTemplateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Plantilla invalida" }, { status: 400 });
    }

    const template = DASHBOARD_TEMPLATES.find((t) => t.id === parsed.data.templateId);
    if (!template) {
      return NextResponse.json({ message: "Plantilla no encontrada" }, { status: 404 });
    }

    const dashboard = await prisma.$transaction(async (tx) => {
      const created = await tx.customDashboard.create({
        data: {
          name: template.name,
          createdByUserId: actor.userId,
        },
      });

      if (template.widgets.length > 0) {
        await tx.dashboardWidget.createMany({
          data: template.widgets.map((widget, index) => ({
            dashboardId: created.id,
            title: widget.title,
            chartType: widget.chartType,
            dataSource: widget.dataSource,
            size: widget.size,
            order: index,
            config: JSON.stringify(widget.config ?? {}),
          })),
        });
      }

      return created;
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "dashboard.created",
      detail: `${actor.displayName} creo dashboard desde plantilla ${template.id}`,
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
    console.error("Error creating dashboard from template:", error);
    return NextResponse.json({ message: "No se pudo crear el dashboard desde plantilla" }, { status: 500 });
  }
}
