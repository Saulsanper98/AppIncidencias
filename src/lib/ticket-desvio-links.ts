import { prisma } from "@/lib/prisma";

export async function linkTicketDesvio(input: {
  ticketId: string;
  desvioId: string;
  kind?: "manual" | "auto";
  createdByUserId?: string | null;
}): Promise<void> {
  await prisma.ticketDesvioLink.upsert({
    where: { ticketId_desvioId: { ticketId: input.ticketId, desvioId: input.desvioId } },
    create: {
      ticketId: input.ticketId,
      desvioId: input.desvioId,
      kind: input.kind ?? "manual",
      createdByUserId: input.createdByUserId ?? null,
    },
    update: {},
  });
}

/** Sugiere desvíos activos que coinciden con bus/línea del ticket. */
export async function suggestDesviosForTicket(input: {
  busId: string;
  lineaLabel?: string | null;
}): Promise<{ id: string; titulo: string; referencia: string; lineas: string[]; estado: string }[]> {
  const busId = input.busId.trim();
  const linea = input.lineaLabel?.trim().toLowerCase() ?? "";

  const desvios = await prisma.desvio.findMany({
    where: { estado: { in: ["PENDIENTE", "ACTIVO"] } },
    orderBy: { fecha_inicio: "desc" },
    take: 80,
    select: {
      id: true,
      titulo: true,
      referencia: true,
      lineas_afectadas: true,
      estado: true,
      motivo: true,
    },
  });

  return desvios
    .map((d) => {
      let lineas: string[] = [];
      try {
        lineas = JSON.parse(d.lineas_afectadas) as string[];
      } catch {
        lineas = [];
      }
      const haystack = `${d.titulo} ${d.motivo} ${d.referencia} ${lineas.join(" ")}`.toLowerCase();
      let score = 0;
      if (busId && haystack.includes(busId.toLowerCase())) score += 2;
      if (linea && lineas.some((l) => l.toLowerCase().includes(linea))) score += 1.5;
      if (linea && haystack.includes(linea)) score += 0.5;
      return { id: d.id, titulo: d.titulo, referencia: d.referencia, lineas, estado: d.estado, score };
    })
    .filter((d) => d.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score: _score, ...rest }) => rest);
}

export async function getBusOperationalContext(busId: string, lineaLabel?: string | null) {
  const trimmedBus = busId.trim();
  if (!trimmedBus) {
    return { tickets: [], desvios: [], links: [] };
  }

  const [tickets, desvios, links] = await Promise.all([
    prisma.ticket.findMany({
      where: { busId: trimmedBus, status: { not: "resuelto" } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        tipo: true,
        subtipo: true,
        lineaLabel: true,
        updatedAt: true,
      },
    }),
    suggestDesviosForTicket({ busId: trimmedBus, lineaLabel }),
    prisma.ticketDesvioLink.findMany({
      where: { ticket: { busId: trimmedBus } },
      include: {
        desvio: { select: { id: true, titulo: true, referencia: true, estado: true } },
        ticket: { select: { id: true, title: true, status: true } },
      },
      take: 30,
    }),
  ]);

  return {
    tickets: tickets.map((t) => ({ ...t, updatedAt: t.updatedAt.toISOString() })),
    desvios,
    links: links.map((l) => ({
      id: l.id,
      kind: l.kind,
      ticket: l.ticket,
      desvio: l.desvio,
    })),
  };
}
