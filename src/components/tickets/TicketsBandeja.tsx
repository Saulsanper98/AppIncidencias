"use client";

import {
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPinned,
  MoreHorizontal,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { TicketView } from "@/components/tickets/tickets-module-types";
import { TICKETS_EMPTY_SHELL, statusMap } from "@/components/tickets/tickets-module-types";
import type { TicketStatus, UserRole } from "@/lib/domain";
import { getAllowedTransitions } from "@/lib/rbac";
import { formatSlaOverdueLabel, toUiPriority } from "@/lib/ticketing";
import {
  priorityBadgeProps,
  slaMinsRemainingTextClass,
  ticketStatusBadgeClassName,
  ticketStatusBadgeVariant,
} from "@/lib/ticket-ui";
import { cn } from "@/lib/utils";

type EmptyIcon = typeof ClipboardList;

function EmptyStateBlock({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
  iconSize = 40,
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
      <Icon size={iconSize} className="mb-3 text-[var(--color-text-3)]" />
      <p className="text-subheading text-[var(--color-text-2)]">{title}</p>
      <p className="mx-auto mt-1 max-w-[280px] text-caption text-[var(--color-text-3)]">{hint}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-lg border border-[var(--color-accent)]/30 px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] transition-all duration-150 hover:bg-[var(--color-accent-light)]"
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
  actionMenuTicketId,
  onToggleActionMenu,
  onOpenStatusChange,
  partCodeFromQuery,
  onClearPartCodeFilter,
  onClearFilters,
}: TicketsBandejaProps) {
  const bandejaTdPad = bandejaCompacta ? "px-1.5 py-1.5 align-top leading-snug" : "px-2 py-3 align-top";
  const bandejaThPad = bandejaCompacta ? "px-1.5 pb-2 pt-1.5" : "px-2 pb-3 pt-2";

  return (
    <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-3">
        <ClipboardList size={15} className="text-[var(--color-text-3)]" />
        <h3 className="text-subheading text-[var(--color-text-1)]">Bandeja de tickets</h3>
        <span className="text-caption text-[var(--color-text-3)]">({ticketsCount})</span>
        <span className="ml-auto hidden text-xs text-[var(--color-text-3)] xl:inline">Bandeja prioritaria; debajo, contexto operativo.</span>
      </div>

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
              <table className={cn("w-full", bandejaCompacta ? "text-[11px]" : "text-sm")}>
                <thead className="sticky top-0 z-[1] border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_0_var(--color-border)]">
                  <tr>
                    <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>ID</th>
                    <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>
                      Título
                    </th>
                    <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>
                      Bus · Activo
                    </th>
                    <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>
                      Estado
                    </th>
                    <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>
                      Prioridad
                    </th>
                    <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>SLA</th>
                    <th
                      className={cn("w-12 bg-[var(--color-surface)] text-center text-label font-medium", bandejaThPad)}
                      title="Acciones por fila"
                    >
                      <span className="sr-only">Acciones</span>
                      <span className="text-xs text-[var(--color-text-3)]" aria-hidden>
                        ⋮
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="[&>tr:nth-child(even)]:bg-[var(--color-surface-2)]/40">
                  {filteredTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="align-top border-b border-[var(--color-border)] transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[var(--color-surface-2)]/55 hover:shadow-[inset_0_0_0_9999px_rgba(0,0,0,0.015)] last:border-0"
                    >
                      <td className={bandejaTdPad}>
                        <div className="flex flex-wrap items-center gap-1">
                          <Link
                            href={`/tickets/${ticket.id}`}
                            className="font-mono text-caption text-[var(--color-accent)] hover:underline"
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
                      <td className={cn("min-w-0 max-w-[min(380px,36vw)] xl:max-w-md", bandejaTdPad)}>
                        <p className="truncate font-medium text-[var(--color-text-1)]">{ticket.title}</p>
                        <p className="truncate text-caption">{ticket.operator}</p>
                        {ticket.assignedToUserName && (
                          <p className="truncate text-[10px] text-[var(--color-accent)]">→ {ticket.assignedToUserName}</p>
                        )}
                      </td>
                      <td className={bandejaTdPad}>
                        <p className="text-[var(--color-text-1)]">{ticket.busId}</p>
                        <p className="text-caption">{ticket.subsubtipo ?? ticket.assetType}</p>
                      </td>
                      <td className={bandejaTdPad}>
                        <Badge
                          className={cn("whitespace-nowrap font-semibold", ticketStatusBadgeClassName(ticket.status))}
                          variant={ticketStatusBadgeVariant(ticket.status)}
                        >
                          {statusMap[ticket.status]}
                        </Badge>
                      </td>
                      <td className={bandejaTdPad}>
                        <span className="inline-flex items-start gap-1 pt-0.5">
                          {ticket.priority === "alta" ? (
                            <SignalHigh size={14} className="mt-0.5 shrink-0 text-[var(--color-error)]/90" aria-hidden />
                          ) : ticket.priority === "media" ? (
                            <SignalMedium size={14} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden />
                          ) : (
                            <SignalLow size={14} className="mt-0.5 shrink-0 text-[var(--color-success)]" aria-hidden />
                          )}
                          {(() => {
                            const pr = priorityBadgeProps(ticket.priority);
                            return (
                              <Badge
                                variant={pr.variant}
                                className={cn(
                                  "whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold",
                                  pr.className,
                                )}
                              >
                                {toUiPriority(ticket.priority)}
                              </Badge>
                            );
                          })()}
                        </span>
                      </td>
                      <td className={bandejaTdPad}>
                        {(() => {
                          const mins = Math.round((new Date(ticket.slaDeadline).getTime() - Date.now()) / 60000);
                          if (mins <= 0) {
                            const full = `${formatSlaOverdueLabel(mins)} · ${new Date(ticket.slaDeadline).toLocaleString("es-ES", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`;
                            return (
                              <div
                                className="flex min-w-0 max-w-[7rem] items-start gap-1.5 border-l-2 border-[var(--color-error)]/35 pl-2"
                                title={full}
                              >
                                <Clock3 size={12} className="mt-0.5 shrink-0 text-[var(--color-text-3)]" aria-hidden />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-medium leading-tight text-[var(--color-error)]">Vencido</p>
                                  <p className="truncate text-[10px] leading-tight text-[var(--color-text-3)]">
                                    {formatSlaOverdueLabel(mins)}
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          if (mins < 120)
                            return (
                              <span className={cn("text-xs tabular-nums", slaMinsRemainingTextClass(mins))}>{mins}m</span>
                            );
                          return <span className="text-xs tabular-nums text-[var(--color-text-3)]">{mins}m</span>;
                        })()}
                      </td>
                      <td className={cn("relative w-12 text-center", bandejaTdPad)}>
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {filteredTickets.map((ticket) => (
              <div
                key={ticket.id}
                className={cn(
                  "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] even:bg-[var(--color-surface-2)]/35",
                  bandejaCompacta ? "p-3" : "p-4",
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
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
                    <Link href={`/tickets/${ticket.id}`}>
                      <h4 className="mt-0.5 truncate text-sm font-medium text-[var(--color-text-1)] transition-colors hover:text-[var(--color-accent)]">
                        {ticket.title}
                      </h4>
                    </Link>
                    <p className="text-caption">
                      {ticket.busId} · {ticket.operator} · {ticket.subsubtipo ?? ticket.assetType}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end justify-center gap-1.5">
                    <Badge
                      className={cn("whitespace-nowrap font-semibold", ticketStatusBadgeClassName(ticket.status))}
                      variant={ticketStatusBadgeVariant(ticket.status)}
                    >
                      {statusMap[ticket.status]}
                    </Badge>
                    <span className="inline-flex items-center justify-end gap-1">
                      {ticket.priority === "alta" ? (
                        <SignalHigh size={14} className="shrink-0 text-[var(--color-error)]/90" aria-hidden />
                      ) : ticket.priority === "media" ? (
                        <SignalMedium size={14} className="shrink-0 text-[var(--color-warning)]" aria-hidden />
                      ) : (
                        <SignalLow size={14} className="shrink-0 text-[var(--color-success)]" aria-hidden />
                      )}
                      {(() => {
                        const pr = priorityBadgeProps(ticket.priority);
                        return (
                          <Badge
                            variant={pr.variant}
                            className={cn(
                              "whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold",
                              pr.className,
                            )}
                          >
                            {toUiPriority(ticket.priority)}
                          </Badge>
                        );
                      })()}
                    </span>
                  </div>
                </div>
                <p className="mb-3 line-clamp-2 text-sm text-[var(--color-text-2)]">{ticket.description}</p>
                <div className="mb-3 flex flex-wrap items-center gap-3 text-caption">
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
                  <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border)] pt-3">
                    {getAllowedTransitions(role, ticket.status).map((nextStatus) => (
                      <button
                        key={`${ticket.id}-${nextStatus}`}
                        type="button"
                        onClick={() => onOpenStatusChange(ticket.id, nextStatus)}
                        className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-2)] transition-all duration-150 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
                      >
                        → {statusMap[nextStatus]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
