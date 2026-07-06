import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { CHART_TYPES } from "@/lib/dashboard/chart-types";
import { prisma } from "@/lib/prisma";
import { canManageDashboards } from "@/lib/rbac";

const createWidgetSchema = z.object({
  title: z.string().trim().min(2),
  chartType: z.enum(CHART_TYPES),
  dataSource: z.enum([
    "tickets_by_status",
    "tickets_by_operator",
    "tickets_by_priority",
    "sla_compliance",
    "manual",
    "operation_links",
    "embed_tickets",
    "embed_inventory",
    "embed_preventive",
  ]),
  size: z.enum(["small", "medium", "large"]),
  config: z.string().default("{}"),
});

const reorderWidgetsSchema = z.object({
  widgetOrders: z.array(
    z.object({
      id: z.string().min(1),
      order: z.number().int(),
    }),
  ),
});

const resizeWidgetSchema = z.object({
  widgetId: z.string().min(1),
  size: z.enum(["small", "medium", "large"]),
});

const updateWidgetSchema = z.object({
  widgetId: z.string().min(1),
  title: z.string().trim().min(2).optional(),
  chartType: z.enum(CHART_TYPES).optional(),
  dataSource: z
    .enum([
      "tickets_by_status",
      "tickets_by_operator",
      "tickets_by_priority",
      "sla_compliance",
      "manual",
      "operation_links",
      "embed_tickets",
      "embed_inventory",
      "embed_preventive",
    ])
    .optional(),
  size: z.enum(["small", "medium", "large"]).optional(),
  config: z.string().optional(),
});

const deleteWidgetSchema = z.object({
  widgetId: z.string().min(1),
});

type ParamsContext = {
  params: Promise<{ dashboardId: string }>;
};

function logWidgetsRouteTiming(method: "POST" | "PATCH" | "DELETE", phase: string, startedAt: number) {
  const elapsedMs = Date.now() - startedAt;
  console.info(`[dashboards/widgets][${method}] ${phase} (${elapsedMs}ms)`);
}

function shouldWriteWidgetAuditEvent() {
  return process.env.NODE_ENV === "production";
}

export async function POST(request: Request, context: ParamsContext) {
  const startedAt = Date.now();
  try {
    const actor = await resolveRequestActor(request);
    logWidgetsRouteTiming("POST", "resolveRequestActor", startedAt);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para añadir widgets" }, { status: 401 });
    }
    if (!canManageDashboards(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para añadir widgets" }, { status: 403 });
    }

    const { dashboardId } = await context.params;
    const payload = await request.json();
    const parsed = createWidgetSchema.safeParse(payload);
    logWidgetsRouteTiming("POST", "payload-validated", startedAt);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos de widget invalidos" }, { status: 400 });
    }

    const lastWidget = await prisma.dashboardWidget.findFirst({
      where: { dashboardId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const widget = await prisma.dashboardWidget.create({
      data: {
        dashboardId,
        title: parsed.data.title,
        chartType: parsed.data.chartType,
        dataSource: parsed.data.dataSource,
        size: parsed.data.size,
        config: parsed.data.config ?? "{}",
        order: (lastWidget?.order ?? 0) + 1,
      },
    });
    logWidgetsRouteTiming("POST", "widget-created", startedAt);

    // En desarrollo evitamos este write para reducir picos intermitentes de latencia (SQLite/local FS contention).
    if (shouldWriteWidgetAuditEvent()) {
      setImmediate(() => {
        void writeAuditEvent({
          userId: actor.userId,
          action: "dashboard.widget_added",
          detail: `${actor.displayName} añadio widget ${widget.id} al dashboard ${dashboardId}`,
        }).catch((auditError) => {
          console.error("Error writing dashboard widget_added audit event:", auditError);
        });
      });
    }

    logWidgetsRouteTiming("POST", "before-return", startedAt);

    return NextResponse.json(
      {
        widget: {
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
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating widget:", error);
    return NextResponse.json({ message: "No se pudo añadir el widget" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const startedAt = Date.now();
  try {
    const actor = await resolveRequestActor(request);
    logWidgetsRouteTiming("PATCH", "resolveRequestActor", startedAt);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para ordenar widgets" }, { status: 401 });
    }
    if (!canManageDashboards(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para ordenar widgets" }, { status: 403 });
    }

    const payload = await request.json();
    const updateParsed = updateWidgetSchema.safeParse(payload);
    if (updateParsed.success) {
      const { widgetId, ...rest } = updateParsed.data;
      const dataToUpdate: Record<string, string> = {};
      if (rest.title !== undefined) dataToUpdate.title = rest.title;
      if (rest.chartType !== undefined) dataToUpdate.chartType = rest.chartType;
      if (rest.dataSource !== undefined) dataToUpdate.dataSource = rest.dataSource;
      if (rest.size !== undefined) dataToUpdate.size = rest.size;
      if (rest.config !== undefined) dataToUpdate.config = rest.config;

      if (Object.keys(dataToUpdate).length === 0) {
        return NextResponse.json({ message: "No hay cambios para actualizar" }, { status: 400 });
      }

      const updated = await prisma.dashboardWidget.update({
        where: { id: widgetId },
        data: dataToUpdate,
      });
      logWidgetsRouteTiming("PATCH", "widget-updated", startedAt);
      return NextResponse.json({
        ok: true,
        widget: {
          id: updated.id,
          title: updated.title,
          chartType: updated.chartType,
          dataSource: updated.dataSource,
          size: updated.size,
          order: updated.order,
          config: updated.config,
        },
      });
    }

    const resizeParsed = resizeWidgetSchema.safeParse(payload);
    logWidgetsRouteTiming("PATCH", "payload-parsed", startedAt);
    if (resizeParsed.success) {
      await prisma.dashboardWidget.update({
        where: { id: resizeParsed.data.widgetId },
        data: { size: resizeParsed.data.size },
      });
      logWidgetsRouteTiming("PATCH", "resize-updated", startedAt);
      return NextResponse.json({ ok: true });
    }

    const reorderParsed = reorderWidgetsSchema.safeParse(payload);
    if (!reorderParsed.success) {
      return NextResponse.json({ message: "Payload de widgets invalido" }, { status: 400 });
    }

    await prisma.$transaction(
      reorderParsed.data.widgetOrders.map((item) =>
        prisma.dashboardWidget.update({
          where: { id: item.id },
          data: { order: item.order },
        }),
      ),
    );
    logWidgetsRouteTiming("PATCH", "reorder-updated", startedAt);

    logWidgetsRouteTiming("PATCH", "before-return", startedAt);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error reordering widgets:", error);
    return NextResponse.json({ message: "No se pudo actualizar el orden de widgets" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const startedAt = Date.now();
  try {
    const actor = await resolveRequestActor(request);
    logWidgetsRouteTiming("DELETE", "resolveRequestActor", startedAt);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para eliminar widgets" }, { status: 401 });
    }
    if (!canManageDashboards(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para eliminar widgets" }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = deleteWidgetSchema.safeParse(payload);
    logWidgetsRouteTiming("DELETE", "payload-parsed", startedAt);
    if (!parsed.success) {
      return NextResponse.json({ message: "Widget invalido" }, { status: 400 });
    }

    const deleted = await prisma.dashboardWidget.delete({
      where: { id: parsed.data.widgetId },
      select: { id: true, dashboardId: true },
    });
    logWidgetsRouteTiming("DELETE", "widget-deleted", startedAt);

    if (shouldWriteWidgetAuditEvent()) {
      setImmediate(() => {
        void writeAuditEvent({
          userId: actor.userId,
          action: "dashboard.widget_removed",
          detail: `${actor.displayName} elimino widget ${deleted.id} de dashboard ${deleted.dashboardId}`,
        }).catch((auditError) => {
          console.error("Error writing dashboard widget_removed audit event:", auditError);
        });
      });
    }

    logWidgetsRouteTiming("DELETE", "before-return", startedAt);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Si el widget ya no existe (p.ej. doble-click / estado desincronizado), no debe romper la UX.
    const maybePrisma = error as { code?: string } | null;
    if (maybePrisma?.code === "P2025") {
      return NextResponse.json({ ok: true });
    }
    console.error("Error deleting widget:", error);
    return NextResponse.json({ message: "No se pudo eliminar el widget" }, { status: 500 });
  }
}
