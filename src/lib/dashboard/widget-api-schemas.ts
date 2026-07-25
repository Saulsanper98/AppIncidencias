import { ALL_DATA_SOURCES } from "@/lib/dashboard/data-sources";
import { CHART_TYPES } from "@/lib/dashboard/chart-types";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dashboardDataSourceSchema = z.enum(ALL_DATA_SOURCES);

export const createWidgetSchema = z.object({
  title: z.string().trim().min(2),
  chartType: z.enum(CHART_TYPES),
  dataSource: dashboardDataSourceSchema,
  size: z.enum(["small", "medium", "large"]),
  config: z.string().default("{}"),
});

export const updateWidgetSchema = z.object({
  widgetId: z.string().min(1),
  title: z.string().trim().min(2).optional(),
  chartType: z.enum(CHART_TYPES).optional(),
  dataSource: dashboardDataSourceSchema.optional(),
  size: z.enum(["small", "medium", "large"]).optional(),
  config: z.string().optional(),
});

export async function assertWidgetBelongsToDashboard(widgetId: string, dashboardId: string) {
  const widget = await prisma.dashboardWidget.findUnique({
    where: { id: widgetId },
    select: { dashboardId: true },
  });
  if (!widget || widget.dashboardId !== dashboardId) {
    return false;
  }
  return true;
}
