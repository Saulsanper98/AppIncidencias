import { prisma } from "@/lib/prisma";

const DEFAULT_MIN_TICKETS = 5;
const DEFAULT_WINDOW_DAYS = 30;

export type ConductorPreventiveThreshold = {
  minTickets: number;
  windowDays: number;
};

export async function getConductorPreventiveThreshold(): Promise<ConductorPreventiveThreshold> {
  const keys = ["conductor_preventive.min_tickets", "conductor_preventive.window_days"] as const;
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [...keys] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const minTickets = Number(map.get("conductor_preventive.min_tickets"));
  const windowDays = Number(map.get("conductor_preventive.window_days"));
  return {
    minTickets: Number.isFinite(minTickets) && minTickets >= 2 ? Math.floor(minTickets) : DEFAULT_MIN_TICKETS,
    windowDays: Number.isFinite(windowDays) && windowDays >= 1 ? Math.floor(windowDays) : DEFAULT_WINDOW_DAYS,
  };
}

/**
 * Si el conductor supera el umbral de tickets con falloOrigen=conductor
 * y no tiene un caso abierto/en_proceso, abre uno nuevo.
 */
export async function evaluateConductorPreventive(conductorId: string): Promise<string | null> {
  const { minTickets, windowDays } = await getConductorPreventiveThreshold();
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const openCase = await prisma.conductorPreventiveCase.findFirst({
    where: {
      conductorId,
      status: { in: ["abierto", "en_proceso"] },
    },
    select: { id: true },
  });
  if (openCase) return openCase.id;

  const ticketCount = await prisma.ticket.count({
    where: {
      conductorId,
      falloOrigen: "conductor",
      status: { not: "borrador" },
      createdAt: { gte: since },
    },
  });

  if (ticketCount < minTickets) return null;

  const conductor = await prisma.conductor.findUnique({
    where: { id: conductorId },
    select: { name: true },
  });
  if (!conductor) return null;

  const created = await prisma.conductorPreventiveCase.create({
    data: {
      conductorId,
      title: `Preventivo conductor · ${conductor.name}`,
      description: `${ticketCount} tickets de origen conductor en los últimos ${windowDays} días (umbral ${minTickets}).`,
      status: "abierto",
      ticketCountAtOpen: ticketCount,
      windowDays,
    },
  });
  return created.id;
}
