import { NextResponse } from "next/server";

import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await ensureCatalogSeeded();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);

    const recentTickets = await prisma.ticket.findMany({
      where: {
        createdAt: {
          gte: fromDate,
        },
      },
      include: {
        bus: true,
        asset: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const grouped = new Map<string, { busId: string; assetType: string; operator: string; municipio: string; count: number }>();
    for (const ticket of recentTickets) {
      const key = `${ticket.busId}::${ticket.asset.type}`;
      const previous = grouped.get(key);
      if (previous) {
        previous.count += 1;
      } else {
        grouped.set(key, {
          busId: ticket.busId,
          assetType: ticket.asset.type,
          operator: ticket.bus.operator,
          municipio: ticket.bus.municipio,
          count: 1,
        });
      }
    }

    const alerts = Array.from(grouped.values())
      .filter((item) => item.count >= 3)
      .map((item) => ({
        busId: item.busId,
        assetType: item.assetType,
        operator: item.operator,
        municipio: item.municipio,
        failuresLast30Days: item.count,
        severity: item.count >= 5 ? "critical" : "warning",
      }))
      .sort((a, b) => b.failuresLast30Days - a.failuresLast30Days);

    const openTasks = await prisma.preventiveTask.findMany({
      where: {
        status: {
          in: ["pendiente", "programada"],
        },
      },
      select: {
        id: true,
        busId: true,
        assetType: true,
      },
    });

    const openMap = new Map<string, string>();
    for (const task of openTasks) {
      openMap.set(`${task.busId}::${task.assetType}`, task.id);
    }

    return NextResponse.json({
      alerts: alerts.map((alert) => {
        const taskId = openMap.get(`${alert.busId}::${alert.assetType}`);
        return {
          ...alert,
          hasOpenPreventiveTask: Boolean(taskId),
          preventiveTaskId: taskId ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Error loading maintenance alerts:", error);
    return NextResponse.json({ message: "No se pudieron cargar alertas preventivas" }, { status: 500 });
  }
}
