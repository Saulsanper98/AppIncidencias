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
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { TicketView } from "@/components/tickets/tickets-module-types";
import { TICKETS_EMPTY_SHELL, statusMap } from "@/components/tickets/tickets-module-types";
import type { TicketStatus, UserRole } from "@/lib/domain";
import { getAllowedTransitions } from "@/lib/rbac";
import { formatSlaOverdueLabel, toUiPriority } from "@/lib/ticketing";
import {
  priorityBadgeProps,
  priorityDotClass,
  slaMinsRemainingTextClass,
  statusDotClass,
  ticketStatusBadgeClassName,
  ticketStatusBadgeVariant,
} from "@/lib/ticket-ui";
import { cn } from "@/lib/utils";

// Persistimos el "último ticket visto" en la bandeja para resaltar la fila tras
// volver desde el detalle. Sólo cliente; no afecta accesibilidad.
const LAST_VIEWED_TICKET_KEY = "ccmgc_bandeja_last_viewed_ticket_v1";

/**
 * Celda SLA con donut visual + duración. El donut se rellena en sentido
 * inverso (de 100 % al inicio del ticket a 0 % al vencer) y cambia de color
 * según urgencia. Si está vencido, muestra etiqueta "Vencido" + hace tiempo.
 */
function SlaCell({ deadline }: { deadline: string }) {
  const mins = Math.round((new Date(deadline).getTime() - Date.now()) / 60000);
  if (mins <= 0) {
    return (
      <div
        className="flex min-w-0 max-w-[8rem] items-center gap-1.5"
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

function SlaDonut({ percent, color }: { percent: number; color: string }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  const offset = c - (c * percent) / 100;
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="shrink-0">
      {/* Aro de fondo: pista muy tenue para que el progreso destaque sin
          competir con el fondo del row. */}
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--color-border)" strokeWidth="2.2" opacity="0.55" />
      <circle
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
        style={{ transition: "stroke-dashoffset 0.4s var(--ease-out)" }}
      />
    </svg>
  );
}

type EmptyIcon = typeof ClipboardList;

function EmptyStateBlock({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
  iconSize = 28,
  compact = false,
}: {
  icon: EmptyIcon;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
  iconSize?: number;
  compact?: boolean;
}) {
  return (
    <div className={cn(TICKETS_EMPTY_SHELL, compact && "!py-6")}>
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-3)] ring-1 ring-[var(--color-border)]">
        <Icon size={iconSize} strokeWidth={1.5} aria-hidden />
      </span>
      <p className="text-subheading text-[var(--color-text-2)]">{title}</p>
      <p className="mx-auto mt-1 max-w-[280px] text-caption text-[var(--color-text-3)]">{hint}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/40 px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] transition-all duration-150 hover:bg-[var(--color-accent-light)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
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
  partCodeFromQuery: string;
  onClearPartCodeFilter: () => void;
  onClearFilters: () => void;
};

export function TicketsBandeja({
  ticketsCount,
  filteredTickets,
  role,
  bandejaCompacta,
  hideCardHeader = false,
  actionMenuTicketId,
  onToggleActionMenu,
  onOpenStatusChange,
  partCodeFromQuery,
  onClearPartCodeFilter,
  onClearFilters,
}: TicketsBandejaProps) {
  // Resaltamos la última fila visitada al volver desde el detalle. No es una
  // "selección" persistente, sino una pista visual para no perder el contexto.
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

  return (
    // En movil bajamos a p-3 para no duplicar padding sobre el contenedor
    // padre (motion.article p-3) y dejar mas ancho real a las cards de
    // tickets de dentro.
    <div className="ccmgc-card mb-4 p-3 sm:p-4">
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
              {ticketsCount}
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
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/35 px-3 py-2 text-[12px] text-[var(--color-text-2)]"
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
        <EmptyStateBlock
          icon={ClipboardList}
          title="Sin tickets"
          hint={
            partCodeFromQuery
              ? `No hay tickets vinculados al repuesto «${partCodeFromQuery}» con los filtros actuales (reserva o consumo). Prueba a quitar el filtro de pieza o relajar estado / bus.`
              : "No hay tickets para los filtros seleccionados. Ajusta estado, operadora o bus, o limpia filtros."
          }
          actionLabel={partCodeFromQuery ? "Quitar filtro de pieza" : "Limpiar filtros"}
          onAction={partCodeFromQuery ? onClearPartCodeFilter : onClearFilters}
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-[var(--color-border)] md:block">
            <div className="max-h-[min(420px,52vh)] overflow-auto">
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
                  {filteredTickets.map((ticket) => {
                    const isLastViewed = ticket.id === lastViewedTicketId;
                    return (
                    <tr key={ticket.id} aria-current={isLastViewed ? "true" : undefined}>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          <Link
                            href={`/tickets/${ticket.id}`}
                            onClick={() => markTicketVisited(ticket.id)}
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
                        {/* Chip con dot leading: lectura más limpia y consistente. */}
                        <Badge
                          className={cn(
                            "gap-1.5 whitespace-nowrap font-semibold tracking-tight",
                            ticketStatusBadgeClassName(ticket.status),
                          )}
                          variant={ticketStatusBadgeVariant(ticket.status)}
                        >
                          <span
                            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDotClass(ticket.status))}
                            aria-hidden
                          />
                          {statusMap[ticket.status]}
                        </Badge>
                      </td>
                      <td>
                        {/* Chip de prioridad unificado con dot, sin icono externo. */}
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
                      <td className="relative w-12 text-center">
                        {getAllowedTransitions(role, ticket.status).length === 0 ? (
                          <span className="text-caption text-[var(--color-text-3)]">—</span>
                        ) : (
                          <div className="flex justify-center" data-ticket-actions>
                            <button
                              type="button"
                              data-ticket-menu-anchor={ticket.id}
                              className="inline-flex h-10 min-h-10 w-10 min-w-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-2)] transition-all duration-200 hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] md:h-8 md:min-h-0 md:w-8 md:min-w-0"
                              aria-expanded={actionMenuTicketId === ticket.id}
                              aria-haspopup="menu"
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
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* space-y-3.5 (14px) en movil da una separacion visual entre
              cards mas clara que el 12px del space-y-3, sin gastar mucho
              alto. En md+ usamos 3 (12px) para mantener la densidad. */}
          <div className="space-y-3.5 md:hidden md:space-y-3">
            {filteredTickets.map((ticket) => {
              const isLastViewedMobile = ticket.id === lastViewedTicketId;
              return (
              <div
                key={ticket.id}
                aria-current={isLastViewedMobile ? "true" : undefined}
                className={cn(
                  "rounded-2xl border bg-[var(--color-surface)] shadow-[0_2px_6px_-4px_rgba(0,0,0,0.4)] transition-colors duration-200 ease-out",
                  bandejaCompacta ? "p-3.5" : "p-4",
                  isLastViewedMobile
                    ? "border-[var(--color-accent)]/50 ring-1 ring-[var(--color-accent)]/25"
                    : "border-[var(--color-border)]",
                )}
              >
                <div className="mb-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
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
                  <div className="flex flex-shrink-0 flex-col items-end justify-center gap-1.5">
                    <Badge
                      className={cn(
                        "gap-1.5 whitespace-nowrap font-semibold tracking-tight",
                        ticketStatusBadgeClassName(ticket.status),
                      )}
                      variant={ticketStatusBadgeVariant(ticket.status)}
                    >
                      <span
                        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDotClass(ticket.status))}
                        aria-hidden
                      />
                      {statusMap[ticket.status]}
                    </Badge>
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
                  </div>
                </div>
                <p className="mb-3 line-clamp-2 text-[13.5px] leading-relaxed text-[var(--color-text-2)] sm:text-sm sm:leading-snug">{ticket.description}</p>
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption">
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <Clock3 size={11} className="shrink-0" />
                    {(() => {
                      const mins = Math.round((new Date(ticket.slaDeadline).getTime() - Date.now()) / 60000);
                      if (mins <= 0) {
                        const full = `Vencido hace ${formatSlaOverdueLabel(mins)} · ${new Date(ticket.slaDeadline).toLocaleString("es-ES", {
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
                            (vence {new Date(ticket.slaDeadline).toLocaleTimeString("es-ES")})
                          </span>
                        </span>
                      );
                    })()}
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
                {getAllowedTransitions(role, ticket.status).length > 0 && (
                  // Botones de transicion: en movil son target tactil
                  // (min-h-9 = 36px) con padding lateral 2.5; en desktop
                  // mantienen el aspecto compacto original.
                  <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border)] pt-3">
                    {getAllowedTransitions(role, ticket.status).map((nextStatus) => (
                      <button
                        key={`${ticket.id}-${nextStatus}`}
                        type="button"
                        onClick={() => onOpenStatusChange(ticket.id, nextStatus)}
                        className="inline-flex min-h-9 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-text-2)] transition-all duration-150 hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] sm:min-h-0 sm:bg-transparent sm:px-2 sm:text-[11px] sm:font-normal"
                      >
                        → {statusMap[nextStatus]}
                      </button>
                    ))}
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
