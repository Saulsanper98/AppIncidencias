/**
 * Alertas preventivas que se muestran en el módulo Tickets ("Alertas
 * preventivas" en la columna derecha) y en banners auxiliares.
 *
 * El criterio histórico era hardcoded a 30 días + umbrales 3/5. A petición
 * del equipo de campo lo migramos a la MISMA configuración que usa
 * `/api/buses/anomalous`: la ventana en días la edita el gestor desde
 * Admin → Buses anómalos y queda guardada en `AppSetting`.
 *
 * Devolvemos también `windowDays` en la respuesta para que el frontend
 * pueda mostrar "X fallos en N días" con el valor real (no '30' hardcoded).
 */

import { NextResponse } from "next/server";

import { ANOMALOUS_DEFAULTS } from "@/lib/anomalous-config";
import { isApiAuthError, requireActor } from "@/lib/api-auth";
import { APP_SETTING_KEYS, getAppSettingNumber } from "@/lib/app-settings";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (isApiAuthError(actor)) return actor;

    await ensureCatalogSeeded();

    // Ventana configurable (default 12 d, rango 7-180). Coincide con
    // la usada por /api/buses/anomalous para que la UX sea coherente.
    const windowDays = await getAppSettingNumber(
      APP_SETTING_KEYS.ANOMALOUS_WINDOW_DAYS,
      ANOMALOUS_DEFAULTS.windowDays,
      { min: 7, max: 180 },
    );

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - windowDays);

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

    const grouped = new Map<
      string,
      { busId: string; assetType: string; operator: string; municipio: string; count: number }
    >();
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
        failuresInWindow: item.count,
        severity: item.count >= 5 ? "critical" : "warning",
      }))
      .sort((a, b) => b.failuresInWindow - a.failuresInWindow);

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
      windowDays,
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
