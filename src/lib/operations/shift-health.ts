import { prisma } from "@/lib/prisma";
import { currentShiftNow, minutesUntilShiftEnd, todayYmd, type ShiftKey } from "@/lib/shift-utils";

export type ShiftHealthSnapshot = {
  shift: ShiftKey;
  shiftDate: string;
  minutesToShiftEnd: number;
  openTickets: number;
  slaOverdue: number;
  highPriorityOpen: number;
  expressIncomplete: number;
  activeDesvios: number;
  unackedHandovers: number;
  openPendingItems: number;
  score: "ok" | "watch" | "critical";
  headlines: string[];
};

async function countOpenSlaMetrics(now: Date) {
  const [slaVencidosCount, altaPrioridadCount] = await Promise.all([
    prisma.ticket.count({
      where: { status: { not: "resuelto" }, slaDeadline: { lt: now } },
    }),
    prisma.ticket.count({
      where: { status: { not: "resuelto" }, priority: "alta" },
    }),
  ]);
  return { slaVencidosCount, altaPrioridadCount };
}

export async function getShiftHealthSnapshot(now = new Date()): Promise<ShiftHealthSnapshot> {
  const shift = currentShiftNow();
  const shiftDate = todayYmd();
  const minutesToShiftEnd = minutesUntilShiftEnd(now);
  const sla = await countOpenSlaMetrics(now);

  const [openTickets, expressIncomplete, activeDesvios, unackedHandovers, pendingOpen] =
    await Promise.all([
      prisma.ticket.count({
        where: { status: { in: ["abierto", "en_proceso", "esperando_repuesto"] } },
      }),
      prisma.ticket.count({ where: { needsCompletion: true, status: { not: "resuelto" } } }),
      prisma.desvio.count({ where: { estado: "ACTIVO" } }),
      prisma.shiftHandover.count({ where: { acknowledgedAt: null } }),
      prisma.shiftHandover.findMany({
        where: { pendingItemsJson: { not: null } },
        select: { pendingItemsJson: true },
        take: 40,
        orderBy: { createdAt: "desc" },
      }),
    ]);

  let openPendingItems = 0;
  for (const row of pendingOpen) {
    if (!row.pendingItemsJson) continue;
    try {
      const items = JSON.parse(row.pendingItemsJson) as Array<{ status?: string }>;
      openPendingItems += items.filter((i) => i.status === "abierta" || !i.status).length;
    } catch {
      /* ignore malformed */
    }
  }

  const headlines: string[] = [];
  if (sla.slaVencidosCount > 0) {
    headlines.push(`${sla.slaVencidosCount} ticket(s) con SLA vencido`);
  }
  if (sla.altaPrioridadCount > 0) {
    headlines.push(`${sla.altaPrioridadCount} de prioridad alta abiertos`);
  }
  if (unackedHandovers > 0) {
    headlines.push(`${unackedHandovers} pase(s) de turno sin acusar`);
  }
  if (openPendingItems > 0) {
    headlines.push(`${openPendingItems} pendiente(s) de handover abiertos`);
  }
  if (activeDesvios > 0) {
    headlines.push(`${activeDesvios} desvío(s) activo(s)`);
  }
  if (expressIncomplete > 0) {
    headlines.push(`${expressIncomplete} apunte(s) express por completar`);
  }
  if (minutesToShiftEnd <= 45) {
    headlines.push(`Relevo en ~${minutesToShiftEnd} min`);
  }

  let score: ShiftHealthSnapshot["score"] = "ok";
  if (sla.slaVencidosCount >= 3 || unackedHandovers >= 2 || sla.altaPrioridadCount >= 5) {
    score = "critical";
  } else if (
    sla.slaVencidosCount > 0 ||
    unackedHandovers > 0 ||
    openPendingItems > 0 ||
    minutesToShiftEnd <= 45 ||
    activeDesvios > 0
  ) {
    score = "watch";
  }

  return {
    shift,
    shiftDate,
    minutesToShiftEnd,
    openTickets,
    slaOverdue: sla.slaVencidosCount,
    highPriorityOpen: sla.altaPrioridadCount,
    expressIncomplete,
    activeDesvios,
    unackedHandovers,
    openPendingItems,
    score,
    headlines: headlines.slice(0, 5),
  };
}
