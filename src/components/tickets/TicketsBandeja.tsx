"use client";

import {
  Bus as BusIcon,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Inbox,
  MapPinned,
  MoreHorizontal,
  Pencil,
  Search,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/count-up";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { TicketView } from "@/components/tickets/tickets-module-types";
import { statusMap, statusTransitionLabel } from "@/components/tickets/tickets-module-types";
import type { TicketStatus, UserRole } from "@/lib/domain";
import { canShowTicketEdit, getAllowedTransitions, ticketHasBandejaActions } from "@/lib/rbac";
import { formatSlaOverdueLabel, toUiPriority } from "@/lib/ticketing";
import { ticketNeedsCompletion } from "@/lib/tickets/pending-completion";
import {
  bandejaPriorityRowClass,
  priorityBadgeProps,
  priorityDotClass,
  slaMinsRemainingTextClass,
  statusDotClass,
  ticketStatusBadgeClassName,
  ticketStatusBadgeVariant,
} from "@/lib/ticket-ui";
import { isFreshItem, useNewItemIds } from "@/hooks/use-animated-list";
import { cn } from "@/lib/utils";

// Persistimos el "último ticket visto" en la bandeja para resaltar la fila tras
// volver desde el detalle. Sólo cliente; no afecta accesibilidad.
const LAST_VIEWED_TICKET_KEY = "ccmgc_bandeja_last_viewed_ticket_v1";

function bandejaDisplayStatus(ticket: TicketView): TicketStatus {
  return ticketNeedsCompletion(ticket) ? "borrador" : ticket.status;
}

function staggerClass(index: number): string {
  return `ccmgc-stagger-in ccmgc-stagger-in-${(index % 6) + 1}`;
}

/** Dispara `bandeja-row--flash-once` cuando la fila pasa a ser la última vista. */
function useFlashOnLastViewed(isLastViewed: boolean): boolean {
  const [flash, setFlash] = useState(false);
  const prev = useRef(false);
  useEffect(() => {
    if (isLastViewed && !prev.current) {
      setFlash(true);
      const id = window.setTimeout(() => setFlash(false), 450);
      prev.current = true;
      return () => window.clearTimeout(id);
    }
    if (!isLastViewed) prev.current = false;
    return undefined;
  }, [isLastViewed]);
  return flash;
}

function mobilePriorityClass(priority: TicketView["priority"]): string {
  if (priority === "alta") return "bandeja-mobile-card--alta";
  if (priority === "media") return "bandeja-mobile-card--media";
  return "bandeja-mobile-card--baja";
}

function slaMinutesRemaining(deadline: string): number {
  return Math.round((new Date(deadline).getTime() - Date.now()) / 60000);
}

/** Minutos hasta SLA; null en SSR/primer paint para evitar mismatch de hidratación. */
function useSlaMinutes(deadline: string): number | null {
  const [mins, setMins] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setMins(slaMinutesRemaining(deadline));
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [deadline]);
  return mins;
}

function SlaPlaceholder() {
  return <Skeleton className="inline-block h-3.5 w-14 rounded" aria-hidden />;
}

/**
 * Celda SLA con donut visual + duración. El donut se rellena en sentido
 * inverso (de 100 % al inicio del ticket a 0 % al vencer) y cambia de color
 * según urgencia. Si está vencido, muestra etiqueta "Vencido" + hace tiempo.
 */
function SlaCell({ deadline }: { deadline: string }) {
  const mins = useSlaMinutes(deadline);
  if (mins === null) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <SlaDonut percent={50} color="var(--color-text-3)" />
        <SlaPlaceholder />
      </div>
    );
  }
  if (mins <= 0) {
    return (
      <div
        className={cn(
          "sla-overdue-pulse flex min-w-0 max-w-[8rem] items-center gap-1.5",
        )}
        title={`${formatSlaOverdueLabel(mins)} · ${new Date(deadline).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}
      >
        <SlaDonut percent={0} color="var(--color-error)" />
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold leading-tight text-[var(--color-error)]">Vencido</p>
          <p className="num-tabular truncate text-[10px] leading-tight text-[var(--color-text-3)]">
            {formatSlaOverdueLabel(mins)}
          </p>
        </div>
      </div>
    );
  }
  // Asumimos un "tramo medio" de SLA de 240m para normalizar visualmente el
  // donut: si quedan >240m está casi lleno; <30m casi vacío.
  const pct = Math.max(0, Math.min(100, Math.round((mins / 240) * 100)));
  const urgent = mins < 30;
  const nearby = !urgent && mins < 120;
  const color = urgent ? "var(--color-error)" : nearby ? "var(--color-warning)" : "var(--color-text-3)";
  const text = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return (
    <div className="flex min-w-0 items-center gap-1.5" title={`Quedan ${text} hasta SLA`}>
      <SlaDonut percent={pct} color={color} />
      <span
        className={cn(
          "num-tabular text-[11.5px]",
          urgent ? "font-semibold text-[var(--color-error)]" :
          nearby ? "text-[var(--color-warning)]" :
          "text-[var(--color-text-3)]",
        )}
      >
        {text}
      </span>
    </div>
  );
}

function SlaMobileLine({ deadline }: { deadline: string }) {
  const mins = useSlaMinutes(deadline);
  if (mins === null) return <SlaPlaceholder />;
  if (mins <= 0) {
    const full = `Vencido hace ${formatSlaOverdueLabel(mins)} · ${new Date(deadline).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    return (
      <span className="min-w-0 text-[var(--color-text-2)]" title={full}>
        <span className="font-medium text-[var(--color-error)]">Vencido</span>{" "}
        <span className="text-[var(--color-text-3)]">hace {formatSlaOverdueLabel(mins)}</span>
      </span>
    );
  }
  const dur = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return (
    <span className="min-w-0 text-[var(--color-text-2)]">
      <span className={cn("font-medium tabular-nums", slaMinsRemainingTextClass(mins))}>SLA · {dur}</span>{" "}
      <span className="text-[var(--color-text-3)]">
        (vence {new Date(deadline).toLocaleTimeString("es-ES")})
      </span>
    </span>
  );
}

function SlaDonut({ percent, color }: { percent: number; color: string }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  const offset = c - (c * percent) / 100;
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden
      className="shrink-0"
      style={{ ["--sla-donut-circ" as string]: c, ["--sla-donut-offset" as string]: offset }}
    >
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--color-border)" strokeWidth="2.2" opacity="0.55" />
      <circle
        key={percent}
        cx="11"
        cy="11"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="2.6"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 11 11)"
        className="sla-donut-stroke"
        style={{ transition: "stroke-dashoffset 0.4s var(--ease-out)" }}
      />
    </svg>
  );
}

export type TicketsBandejaProps = {
  ticketsCount: number;
  filteredTickets: TicketView[];
  role: UserRole;
  bandejaCompacta: boolean;
  /** Oculta el encabezado interno cuando el hero de pagina ya dice "Bandeja". */
  hideCardHeader?: boolean;
  actionMenuTicketId: string | null;
  onToggleActionMenu: (ticketId: string) => void;
  onOpenStatusChange: (ticketId: string, nextStatus: TicketStatus) => void;
  onOpenEdit?: (ticketId: string) => void;
  isReadOnly?: boolean;
  actorUserId?: string;
  partCodeFromQuery: string;
  onClearPartCodeFilter: () => void;
  onClearFilters: () => void;
  searchQuery?: string;
  onlyMine?: boolean;
  statusFilter?: "todos" | TicketStatus;
  priorityFilter?: "todos" | TicketView["priority"];
  operatorFilter?: string;
  busFilter?: string;
};

type EmptyStateConfig = {
  icon: typeof ClipboardList;
  title: string;
  hint: string;
  actionLabel: string;
  onAction: () => void;
};

function resolveBandejaEmptyState(props: TicketsBandejaProps): EmptyStateConfig {
  const {
    partCodeFromQuery,
    searchQuery = "",
    onlyMine = false,
    statusFilter = "todos",
    priorityFilter = "todos",
    operatorFilter = "todas",
    busFilter = "todas",
    onClearPartCodeFilter,
    onClearFilters,
  } = props;

  if (partCodeFromQuery) {
    return {
      icon: ClipboardList,
      title: "Sin tickets para esta pieza",
      hint: `No hay tickets vinculados al repuesto «${partCodeFromQuery}» con los filtros actuales.`,
      actionLabel: "Quitar filtro de pieza",
      onAction: onClearPartCodeFilter,
    };
  }
  if (searchQuery.trim()) {
    return {
      icon: Search,
      title: "Sin coincidencias",
      hint: `Ningún ticket coincide con «${searchQuery.trim()}». Prueba con otro término o limpia la búsqueda.`,
      actionLabel: "Limpiar búsqueda",
      onAction: onClearFilters,
    };
  }
  if (onlyMine) {
    return {
      icon: UserCheck,
      title: "Sin tickets asignados",
      hint: "No tienes incidencias asignadas con los filtros actuales. Prueba a quitar «Mis tickets» o relajar estado.",
      actionLabel: "Limpiar filtros",
      onAction: onClearFilters,
    };
  }
  if (statusFilter !== "todos") {
    return {
      icon: Inbox,
      title: `Sin tickets en «${statusMap[statusFilter]}»`,
      hint: "No hay incidencias con este estado. Cambia el filtro o limpia para ver toda la bandeja.",
      actionLabel: "Limpiar filtros",
      onAction: onClearFilters,
    };
  }
  if (priorityFilter !== "todos") {
    return {
      icon: Inbox,
      title: `Sin prioridad ${toUiPriority(priorityFilter)}`,
      hint: "No hay tickets con esta prioridad en la vista actual.",
      actionLabel: "Limpiar filtros",
      onAction: onClearFilters,
    };
  }
  if (operatorFilter !== "todas") {
    return {
      icon: BusIcon,
      title: `Sin tickets de ${operatorFilter}`,
      hint: "Prueba otra operadora o limpia filtros para ver el conjunto completo.",
      actionLabel: "Limpiar filtros",
      onAction: onClearFilters,
    };
  }
  if (busFilter !== "todas") {
    return {
      icon: BusIcon,
      title: `Sin tickets del bus ${busFilter}`,
      hint: "Este vehículo no tiene incidencias con los filtros actuales.",
      actionLabel: "Limpiar filtros",
      onAction: onClearFilters,
    };
  }
  return {
    icon: ClipboardList,
    title: "Sin tickets en esta vista",
    hint: "No hay tickets para los filtros seleccionados. Ajusta estado, operadora o bus, o limpia filtros.",
    actionLabel: "Limpiar filtros",
    onAction: onClearFilters,
  };
}

function BandejaTableRow({
  ticket,
  index,
  isLastViewed,
  isFresh,
  role,
  isReadOnly = false,
  actorUserId,
  actionMenuTicketId,
  onToggleActionMenu,
  onMarkVisited,
}: {
  ticket: TicketView;
  index: number;
  isLastViewed: boolean;
  isFresh?: boolean;
  role: UserRole;
  isReadOnly?: boolean;
  actorUserId?: string;
  actionMenuTicketId: string | null;
  onToggleActionMenu: (ticketId: string) => void;
  onMarkVisited: (ticketId: string) => void;
}) {
  const flash = useFlashOnLastViewed(isLastViewed);
  const displayStatus = bandejaDisplayStatus(ticket);
  const pendingComplete = ticketNeedsCompletion(ticket);
  const hasActions = ticketHasBandejaActions(
    role,
    ticket.status,
    isReadOnly,
    pendingComplete,
    actorUserId,
    ticket,
  );
  return (
    <tr
      aria-current={isLastViewed ? "true" : undefined}
      className={cn(
        staggerClass(index),
        "bandeja-row-lift",
        bandejaPriorityRowClass(ticket.priority),
        isLastViewed && "bandeja-row--last-viewed",
        flash && "bandeja-row--flash-once",
        isFresh && "ccmgc-row-enter",
      )}
    >
      <td>
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href={`/tickets/${ticket.id}`}
            onClick={() => onMarkVisited(ticket.id)}
            title={`Abrir ticket ${ticket.id.slice(-8).toUpperCase()}`}
            className={cn(
              "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-tight transition-colors",
              "border-[var(--color-border)] bg-[var(--color-surface-2)]/55 text-[var(--color-accent)] hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-accent-light)]",
              isLastViewed && "border-[var(--color-accent)]/45 bg-[var(--color-accent-light)] ring-1 ring-[var(--color-accent)]/25",
            )}
          >
            {ticket.id.slice(-8).toUpperCase()}
          </Link>
          <Link
            href={`/mapa?ticket=${encodeURIComponent(ticket.id)}`}
            className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-3)] transition-colors hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
            title="Ver en mapa"
            aria-label={`Ver ticket ${ticket.id.slice(-8).toUpperCase()} en mapa`}
          >
            <MapPinned size={14} aria-hidden />
          </Link>
        </div>
      </td>
      <td className="min-w-0 max-w-[min(380px,36vw)] xl:max-w-md">
        <p className="truncate text-[13px] font-semibold tracking-tight text-[var(--color-text-1)]">
          {ticket.title}
        </p>
        <p className="truncate text-[11px] text-[var(--color-text-2)]">{ticket.operator}</p>
        {ticket.lineaLabel || ticket.servicioLabel || ticket.conductorLabel ? (
          <p className="mt-0.5 truncate text-[10px] text-[var(--color-text-3)]">
            {ticket.lineaLabel ? (
              <span title="Línea">{ticket.lineaLabel}</span>
            ) : null}
            {ticket.lineaLabel && (ticket.servicioLabel || ticket.conductorLabel) ? (
              <span className="text-[var(--color-border)]"> · </span>
            ) : null}
            {ticket.servicioLabel ? (
              <span title="Servicio">{ticket.servicioLabel}</span>
            ) : null}
            {ticket.servicioLabel && ticket.conductorLabel ? (
              <span className="text-[var(--color-border)]"> · </span>
            ) : null}
            {ticket.conductorLabel ? (
              <span title="Conductor">{ticket.conductorLabel}</span>
            ) : null}
          </p>
        ) : null}
        {ticket.assignedToUserName && (
          <p className="truncate text-[10px] text-[var(--color-accent)]">→ {ticket.assignedToUserName}</p>
        )}
      </td>
      <td>
        <div className="flex items-center gap-1.5">
          <BusIcon
            size={12}
            strokeWidth={1.8}
            className="shrink-0 text-[var(--color-text-3)]/80"
            aria-hidden
          />
          <p className="font-mono text-[12px] font-medium text-[var(--color-text-1)]">{ticket.busId}</p>
        </div>
        <p className="mt-0.5 truncate pl-[1.125rem] text-[11px] text-[var(--color-text-3)]">
          {ticket.subsubtipo ?? ticket.assetType}
        </p>
      </td>
      <td>
        <Badge
          className={cn(
            "gap-1.5 whitespace-nowrap font-semibold tracking-tight",
            ticketStatusBadgeClassName(displayStatus),
          )}
          variant={ticketStatusBadgeVariant(displayStatus)}
        >
          <span
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDotClass(displayStatus))}
            aria-hidden
          />
          {statusMap[displayStatus]}
        </Badge>
      </td>
      <td>
        {(() => {
          const pr = priorityBadgeProps(ticket.priority);
          return (
            <Badge
              variant={pr.variant}
              className={cn(
                "gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-tight",
                pr.className,
              )}
            >
              <span
                className={cn("h-1.5 w-1.5 shrink-0 rounded-full", priorityDotClass(ticket.priority))}
                aria-hidden
              />
              {toUiPriority(ticket.priority)}
            </Badge>
          );
        })()}
      </td>
      <td>
        <SlaCell deadline={ticket.slaDeadline} />
      </td>
      <td className="text-center">
        {hasActions ? (
          <div className="relative inline-flex">
            <button
              type="button"
              data-ticket-menu-anchor={ticket.id}
              className={cn(
                "inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-3)] transition-colors hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]",
                actionMenuTicketId === ticket.id &&
                  "border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] text-[var(--color-accent)]",
              )}
              title={`Acciones · ticket ${ticket.id.slice(-8).toUpperCase()}`}
              aria-label={`Acciones para ticket ${ticket.id.slice(-8)}`}
              onClick={(ev) => {
                ev.stopPropagation();
                onToggleActionMenu(ticket.id);
              }}
            >
              <MoreHorizontal size={16} strokeWidth={2} className="shrink-0" aria-hidden />
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export function TicketsBandeja({
  ticketsCount,
  filteredTickets,
  role,
  bandejaCompacta,
  hideCardHeader = false,
  actionMenuTicketId,
  onToggleActionMenu,
  onOpenStatusChange,
  onOpenEdit,
  isReadOnly = false,
  actorUserId,
  partCodeFromQuery,
  onClearPartCodeFilter,
  onClearFilters,
  searchQuery = "",
  onlyMine = false,
  statusFilter = "todos",
  priorityFilter = "todos",
  operatorFilter = "todas",
  busFilter = "todas",
}: TicketsBandejaProps) {
  const [lastViewedTicketId, setLastViewedTicketId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LAST_VIEWED_TICKET_KEY);
      if (raw) setLastViewedTicketId(raw);
    } catch {
      /* ignore */
    }
  }, []);
  const markTicketVisited = (ticketId: string) => {
    try {
      sessionStorage.setItem(LAST_VIEWED_TICKET_KEY, ticketId);
    } catch {
      /* ignore */
    }
    setLastViewedTicketId(ticketId);
  };

  const freshIds = useNewItemIds(filteredTickets);

  const emptyState = resolveBandejaEmptyState({
    ticketsCount,
    filteredTickets,
    role,
    bandejaCompacta,
    hideCardHeader,
    actionMenuTicketId,
    onToggleActionMenu,
    onOpenStatusChange,
    partCodeFromQuery,
    onClearPartCodeFilter,
    onClearFilters,
    searchQuery,
    onlyMine,
    statusFilter,
    priorityFilter,
    operatorFilter,
    busFilter,
  });

  const embedded = hideCardHeader;

  return (
    <div
      className={cn(
        embedded ? "bandeja-embedded" : "ccmgc-card mb-4 p-3 sm:p-4",
      )}
    >
      {!hideCardHeader ? (
      <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] pb-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
          <Inbox size={16} strokeWidth={1.7} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="flex items-baseline gap-2 text-subheading text-[var(--color-text-1)]">
            Bandeja de tickets
            <span
              className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--color-surface-2)] px-1.5 text-[11px] font-semibold text-[var(--color-text-2)]"
              title={`${ticketsCount} ticket${ticketsCount === 1 ? "" : "s"} en la vista actual`}
            >
              <CountUp value={ticketsCount} />
            </span>
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-text-3)]">
            Bandeja prioritaria; debajo, contexto operativo del centro.
          </p>
        </div>
      </div>
      ) : null}

      {partCodeFromQuery ? (
        <div
          role="status"
          className={cn(
            "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/35 px-3 py-2 text-[12px] text-[var(--color-text-2)]",
            embedded && "mx-4",
          )}
        >
          <p>
            <span className="font-medium text-[var(--color-text-1)]">Filtro por repuesto:</span>{" "}
            <code className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">
              {partCodeFromQuery}
            </code>{" "}
            (tickets con reserva activa o consumida de esta pieza).
          </p>
          <button
            type="button"
            onClick={onClearPartCodeFilter}
            className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)]"
          >
            Quitar filtro de pieza
          </button>
        </div>
      ) : null}

      {ticketsCount === 0 ? (
        <div className={cn(embedded && "px-4 pb-5")}>
          <EmptyState
            icon={emptyState.icon}
            title={emptyState.title}
            hint={emptyState.hint}
            actionLabel={emptyState.actionLabel}
            onAction={emptyState.onAction}
          />
        </div>
      ) : (
        <>
          <div
            className={cn(
              "hidden md:block",
              embedded
                ? "bandeja-table-scroll max-h-[min(520px,62vh)] overflow-auto"
                : "overflow-hidden rounded-lg border border-[var(--color-border)]",
            )}
          >
            <div className={cn(!embedded && "max-h-[min(480px,58vh)] overflow-auto")}>
              <table className={cn("ccmgc-table", bandejaCompacta && "ccmgc-table--compact")}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Título</th>
                    <th>Bus · Activo</th>
                    <th>Estado</th>
                    <th>Prioridad</th>
                    <th>SLA</th>
                    <th className="w-12 text-center" title="Acciones por fila">
                      <span className="sr-only">Acciones</span>
                      <span className="text-xs text-[var(--color-text-3)]" aria-hidden>
                        ⋮
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket, index) => (
                    <BandejaTableRow
                      key={ticket.id}
                      ticket={ticket}
                      index={index}
                      isLastViewed={ticket.id === lastViewedTicketId}
                      isFresh={isFreshItem(freshIds, ticket.id)}
                      role={role}
                      isReadOnly={isReadOnly}
                      actorUserId={actorUserId}
                      actionMenuTicketId={actionMenuTicketId}
                      onToggleActionMenu={onToggleActionMenu}
                      onMarkVisited={markTicketVisited}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div
            className={cn(
              "space-y-3.5 md:hidden md:space-y-3",
              embedded && "px-4 pb-4 pt-1",
            )}
          >
            {filteredTickets.map((ticket, index) => {
              const isLastViewedMobile = ticket.id === lastViewedTicketId;
              return (
              <div
                key={ticket.id}
                aria-current={isLastViewedMobile ? "true" : undefined}
                className={cn(
                  staggerClass(index),
                  "rounded-2xl border bg-[var(--color-surface)] shadow-[0_2px_6px_-4px_rgba(0,0,0,0.4)] transition-colors duration-200 ease-out",
                  bandejaCompacta ? "p-3.5" : "p-4",
                  mobilePriorityClass(ticket.priority),
                  isLastViewedMobile
                    ? "bandeja-mobile-card--last-viewed"
                    : "border-[var(--color-border)]",
                  isFreshItem(freshIds, ticket.id) && "ccmgc-row-enter",
                )}
              >
                <div className="mb-2.5 flex min-w-0 flex-col gap-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-mono text-caption text-[var(--color-text-3)]">{ticket.id.slice(-8).toUpperCase()}</p>
                      <Link
                        href={`/mapa?ticket=${encodeURIComponent(ticket.id)}`}
                        className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-3)] transition-colors hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
                        title="Ver en mapa"
                        aria-label={`Mapa · ${ticket.id.slice(-8).toUpperCase()}`}
                      >
                        <MapPinned size={14} aria-hidden />
                      </Link>
                    </div>
                    <Link href={`/tickets/${ticket.id}`} onClick={() => markTicketVisited(ticket.id)}>
                      <h4 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-[var(--color-text-1)] transition-colors hover:text-[var(--color-accent)] sm:line-clamp-1 sm:truncate sm:text-sm">
                        {ticket.title}
                      </h4>
                    </Link>
                    <p className="mt-0.5 text-caption leading-snug">
                      {ticket.busId} · {ticket.operator} · {ticket.subsubtipo ?? ticket.assetType}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      className={cn(
                        "gap-1.5 font-semibold tracking-tight sm:whitespace-nowrap",
                        ticketStatusBadgeClassName(bandejaDisplayStatus(ticket)),
                      )}
                      variant={ticketStatusBadgeVariant(bandejaDisplayStatus(ticket))}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          statusDotClass(bandejaDisplayStatus(ticket)),
                        )}
                        aria-hidden
                      />
                      {statusMap[bandejaDisplayStatus(ticket)]}
                    </Badge>
                    {(() => {
                      const pr = priorityBadgeProps(ticket.priority);
                      return (
                        <Badge
                          variant={pr.variant}
                          className={cn(
                            "gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-tight sm:whitespace-nowrap",
                            pr.className,
                          )}
                        >
                          <span
                            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", priorityDotClass(ticket.priority))}
                            aria-hidden
                          />
                          {toUiPriority(ticket.priority)}
                        </Badge>
                      );
                    })()}
                  </div>
                </div>
                <p className="mb-3 line-clamp-2 text-[13.5px] leading-relaxed text-[var(--color-text-2)] sm:text-sm sm:leading-snug">{ticket.description}</p>
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption">
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <Clock3 size={11} className="shrink-0" />
                    <SlaMobileLine deadline={ticket.slaDeadline} />
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 size={11} />
                    {ticket.comments.length} comentarios
                  </span>
                  <span className="flex items-center gap-1">
                    <Camera size={11} />
                    {ticket.attachments.length} adjuntos
                  </span>
                </div>
                {(getAllowedTransitions(role, ticket.status, isReadOnly).length > 0 ||
                  canShowTicketEdit(role, ticket.status, isReadOnly, false, actorUserId, ticket)) && (
                  <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border)] pt-3">
                    {getAllowedTransitions(role, ticket.status, isReadOnly).map((nextStatus) => (
                      <button
                        key={`${ticket.id}-${nextStatus}`}
                        type="button"
                        onClick={() => onOpenStatusChange(ticket.id, nextStatus)}
                        className="inline-flex min-h-9 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-text-2)] transition-all duration-150 hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] sm:min-h-0 sm:bg-transparent sm:px-2 sm:text-[11px] sm:font-normal"
                      >
                        → {statusTransitionLabel(ticket.status, nextStatus)}
                      </button>
                    ))}
                    {canShowTicketEdit(role, ticket.status, isReadOnly, false, actorUserId, ticket) && onOpenEdit ? (
                      <button
                        type="button"
                        onClick={() => onOpenEdit(ticket.id)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-text-2)] transition-all duration-150 hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] sm:min-h-0 sm:bg-transparent sm:px-2 sm:text-[11px] sm:font-normal"
                      >
                        <Pencil size={12} aria-hidden />
                        Corregir datos
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
