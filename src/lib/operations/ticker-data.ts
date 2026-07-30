import type { UserRole } from "@/lib/domain";
import { getDesviosPoller } from "@/lib/desvios/email-poller";
import { listDesvios } from "@/lib/desvios/repo";
import {
  formatTicketTickerLabel,
  isSlaOverdue,
  slaMinutesRemaining,
} from "@/lib/operations/sla-metrics";
import { prisma } from "@/lib/prisma";
import type { TickerItem, TickerSnapshot, TickerSummaryPart } from "@/lib/operations/ticker-types";

const REFRESH_MS = 90_000;
const MAX_CRITICAL_TICKETS = 3;
const MAX_CRITICAL_WITH_SLA_BLOCK = 2;
const MAX_LINEAS_IN_LABEL = 6;

function formatLineas(lineas: string[], limit = MAX_LINEAS_IN_LABEL): string {
  const uniq = Array.from(new Set(lineas.map((l) => l.trim()).filter(Boolean))).slice(0, limit);
  if (uniq.length === 0) return "";
  return uniq.map((l) => (l.startsWith("L") ? l : `L${l}`)).join(" · ");
}

function isOperationalRole(role: UserRole): boolean {
  return role === "tecnico_campo" || role === "gestor_centro_control";
}

function buildSignature(parts: {
  slaVencidos: number;
  activos: number;
  pendientes: number;
  criticalIds: string[];
  pollerIssue: boolean;
  openCount: number;
}): string {
  return [
    `sla:${parts.slaVencidos}`,
    `a:${parts.activos}`,
    `p:${parts.pendientes}`,
    `o:${parts.openCount}`,
    parts.pollerIssue ? "poller:1" : "poller:0",
    parts.criticalIds.join(","),
  ].join("|");
}

/** Conteo global de SLA vencido y alta prioridad (misma lógica que el ticker). */
export async function countOpenSlaMetrics(now = new Date()) {
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

/** Agrega datos operativos en vivo para la franja superior global. */
export async function buildOperationalTicker(role: UserRole): Promise<TickerSnapshot> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const operational = isOperationalRole(role);

  const [activosResult, pendientesResult, openTickets, createdTodayCount, openCount, slaMetrics] =
    await Promise.all([
      listDesvios({ estado: "ACTIVO", pageSize: 20, page: 1 }),
      listDesvios({ estado: "PENDIENTE", pageSize: 10, page: 1 }),
      operational
        ? prisma.ticket.findMany({
            where: { status: { not: "resuelto" } },
            orderBy: [{ slaDeadline: "asc" }],
            take: 40,
            select: {
              id: true,
              title: true,
              busId: true,
              priority: true,
              slaDeadline: true,
            },
          })
        : Promise.resolve([]),
      operational
        ? prisma.ticket.count({
            where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
          })
        : Promise.resolve(0),
      operational
        ? prisma.ticket.count({ where: { status: { not: "resuelto" } } })
        : Promise.resolve(0),
      operational ? countOpenSlaMetrics(now) : Promise.resolve({ slaVencidosCount: 0, altaPrioridadCount: 0 }),
    ]);

  const items: TickerItem[] = [];
  let hasPulse = false;
  let pollerIssue = false;

  if (operational) {
    const poller = getDesviosPoller().status();
    if (poller.enabled && (poller.lastError || !poller.running)) {
      pollerIssue = true;
      hasPulse = true;
      items.push({
        id: "poller-error",
        kind: "poller_error",
        tone: "critical",
        label: poller.lastError ? "Poller de desvíos: error de sincronización" : "Poller de desvíos detenido",
        href: "/desvios",
      });
    }
  }

  const slaVencidosCount = slaMetrics.slaVencidosCount;

  if (slaVencidosCount > 0) {
    hasPulse = true;
    items.push({
      id: "sla-summary",
      kind: "sla_summary",
      tone: "critical",
      label:
        slaVencidosCount === 1
          ? "1 ticket fuera de SLA"
          : `${slaVencidosCount} tickets fuera de SLA`,
      href: "/bandeja?sla=overdue",
    });
  }

  const activosCount = activosResult.total;
  const pendientesCount = pendientesResult.total;

  if (activosCount > 0) {
    hasPulse = true;
    const lineas = formatLineas(activosResult.items.flatMap((d) => d.lineas_afectadas ?? []));
    const countLabel =
      activosCount === 1 ? "1 desvío activo" : `${activosCount} desvíos activos`;
    items.push({
      id: "desvios-activos",
      kind: "desvio_summary",
      tone: "warning",
      label: lineas ? `${countLabel} · ${lineas}` : countLabel,
      href: "/desvios?estado=ACTIVO",
    });
  }

  if (pendientesCount > 0) {
    items.push({
      id: "desvios-pendientes",
      kind: "desvio_pendiente",
      tone: "info",
      label:
        pendientesCount === 1
          ? "1 desvío pendiente de confirmar"
          : `${pendientesCount} desvíos pendientes de confirmar`,
      href: "/desvios?estado=PENDIENTE",
    });
  }

  const ticketLimit = slaVencidosCount > 0 ? MAX_CRITICAL_WITH_SLA_BLOCK : MAX_CRITICAL_TICKETS;
  const criticalTickets = operational
    ? openTickets
        .filter((t) => {
          const overdue = isSlaOverdue(t.slaDeadline);
          if (slaVencidosCount > 0) {
            return t.priority === "alta" && !overdue;
          }
          return t.priority === "alta" || overdue;
        })
        .sort((a, b) => a.slaDeadline.getTime() - b.slaDeadline.getTime())
        .slice(0, ticketLimit)
    : [];

  for (const t of criticalTickets) {
    hasPulse = true;
    const { label, fullLabel } = formatTicketTickerLabel(t.busId, t.title);
    items.push({
      id: `ticket-${t.id}`,
      kind: "ticket_critical",
      tone: "warning",
      label,
      title: fullLabel,
      href: `/tickets/${t.id}`,
    });
  }

  if (operational && openCount > 0 && items.length === 0) {
    items.push({
      id: "open-summary",
      kind: "today_summary",
      tone: "info",
      label: `${openCount} incidencia${openCount === 1 ? "" : "s"} abierta${openCount === 1 ? "" : "s"}`,
      href: "/bandeja",
    });
  }

  const showBar =
    items.length > 0 ||
    activosCount > 0 ||
    pendientesCount > 0 ||
    (operational && openCount > 0);

  const summaryParts: TickerSummaryPart[] = [];
  if (operational && showBar) {
    if (createdTodayCount > 0) {
      summaryParts.push({
        id: "today",
        label: `Hoy: ${createdTodayCount} creada${createdTodayCount === 1 ? "" : "s"}`,
        href: "/bandeja",
      });
    }
    if (openCount > 0) {
      summaryParts.push({
        id: "open",
        label: `${openCount} abierta${openCount === 1 ? "" : "s"}`,
        href: "/bandeja",
      });
    }
    if (slaVencidosCount > 0) {
      summaryParts.push({
        id: "sla",
        label: `${slaVencidosCount} fuera SLA`,
        href: "/bandeja?sla=overdue",
      });
    }
    if (activosCount > 0) {
      summaryParts.push({
        id: "desvios",
        label: `${activosCount} desvío${activosCount === 1 ? "" : "s"}`,
        href: "/desvios?estado=ACTIVO",
      });
    }
  } else if (!operational && (activosCount > 0 || pendientesCount > 0)) {
    if (activosCount > 0) {
      summaryParts.push({
        id: "desvios",
        label: `${activosCount} activo${activosCount === 1 ? "" : "s"}`,
        href: "/desvios?estado=ACTIVO",
      });
    }
    if (pendientesCount > 0) {
      summaryParts.push({
        id: "pendientes",
        label: `${pendientesCount} pendiente${pendientesCount === 1 ? "" : "s"}`,
        href: "/desvios?estado=PENDIENTE",
      });
    }
  }

  if (!showBar) {
    return {
      items: [],
      summaryParts: [],
      hasPulse: false,
      refreshMs: REFRESH_MS,
      signature: "empty",
    };
  }

  const signature = buildSignature({
    slaVencidos: slaVencidosCount,
    activos: activosCount,
    pendientes: pendientesCount,
    criticalIds: criticalTickets.map((t) => t.id),
    pollerIssue,
    openCount,
  });

  return {
    items,
    summaryParts,
    hasPulse,
    refreshMs: REFRESH_MS,
    signature,
  };
}

// Re-export for tests / callers that imported from here before.
export { slaMinutesRemaining };
