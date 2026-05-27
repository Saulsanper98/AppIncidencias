"use client";

import { createPortal } from "react-dom";

import type { TicketView } from "@/components/tickets/tickets-module-types";
import { statusMap } from "@/components/tickets/tickets-module-types";
import type { TicketStatus, UserRole } from "@/lib/domain";
import { canAssignTicket, getAllowedTransitions } from "@/lib/rbac";

type TicketActionMenuProps = {
  ticket: TicketView | null;
  viewport: { top: number; left: number } | null;
  role: UserRole;
  onOpenStatusChange: (ticketId: string, nextStatus: TicketStatus) => void;
  onOpenAssign: (ticketId: string, currentTechnicianId: string | null) => void;
  onOpenDelete?: (ticketId: string, ticketTitle: string) => void;
};

export function TicketActionMenu({
  ticket,
  viewport,
  role,
  onOpenStatusChange,
  onOpenAssign,
  onOpenDelete,
}: TicketActionMenuProps) {
  if (!ticket || !viewport) return null;
  const canDelete = role === "tecnico_campo" || role === "gestor_centro_control";

  return createPortal(
    <ul
      data-ticket-actions-portal-menu
      role="menu"
      style={{
        position: "fixed",
        top: viewport.top,
        left: viewport.left,
        minWidth: "11rem",
        zIndex: 90,
      }}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl"
    >
      {getAllowedTransitions(role, ticket.status).map((nextStatus) => (
        <li key={`${ticket.id}-${nextStatus}`} role="none">
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-xs text-[var(--color-text-2)] transition-colors duration-200 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
            onClick={() => onOpenStatusChange(ticket.id, nextStatus)}
          >
            {nextStatus === "esperando_repuesto" ? "Esperar repuesto" : statusMap[nextStatus]}
          </button>
        </li>
      ))}
      {canAssignTicket(role) && ticket.status !== "resuelto" && (
        <>
          {getAllowedTransitions(role, ticket.status).length > 0 && (
            <li role="none">
              <hr className="my-1 border-[var(--color-border)]" />
            </li>
          )}
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text-2)] transition-colors duration-200 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
              onClick={() => onOpenAssign(ticket.id, ticket.assignedToUserId ?? null)}
            >
              Asignar técnico…
            </button>
          </li>
        </>
      )}
      {canDelete && onOpenDelete && (
        <>
          <li role="none">
            <hr className="my-1 border-[var(--color-border)]" />
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-rose-300 transition-colors duration-200 hover:bg-rose-500/10 hover:text-rose-200"
              onClick={() => onOpenDelete(ticket.id, ticket.title)}
            >
              Eliminar ticket…
            </button>
          </li>
        </>
      )}
    </ul>,
    document.body,
  );
}
