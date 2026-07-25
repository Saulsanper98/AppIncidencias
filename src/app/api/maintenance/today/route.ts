import { NextResponse } from "next/server";

import { isApiAuthError, requireActor } from "@/lib/api-auth";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (isApiAuthError(actor)) return actor;

    await ensureCatalogSeeded();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const tasks = await prisma.preventiveTask.findMany({
      where: {
        status: "programada",
        scheduledAt: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        scheduledAt: "asc",
      },
      include: {
        assignedToUser: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({
      tasks: tasks.map((task) => ({
        id: task.id,
        busId: task.busId,
        assetType: task.assetType,
        reason: task.reason,
        scheduledAt: task.scheduledAt?.toISOString() ?? null,
        technician: task.assignedToUser?.name ?? "Sin asignar",
      })),
    });
  } catch (error) {
    console.error("Error loading today preventive agenda:", error);
    return NextResponse.json({ message: "No se pudo cargar agenda preventiva" }, { status: 500 });
  }
}
