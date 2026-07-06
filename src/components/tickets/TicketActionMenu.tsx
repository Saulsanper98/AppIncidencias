"use client";

import { motion } from "framer-motion";
import { Download, Pencil } from "lucide-react";
import { createPortal } from "react-dom";

import type { TicketView } from "@/components/tickets/tickets-module-types";
import { statusTransitionLabel } from "@/components/tickets/tickets-module-types";
import type { TicketStatus, UserRole } from "@/lib/domain";
import { fadeScale, motionTransition } from "@/lib/motion";
import {
  canAssignTicket,
  canEditTicket,
  canRequestTicketDeletion,
  canShowTicketEdit,
  canSoftDeleteTicket,
  getAllowedTransitions,
} from "@/lib/rbac";
import { isTicketOwnedByActor } from "@/lib/ticket-ownership";
import { ticketIncidentDocUrl } from "@/lib/tickets/incident-doc-url";
import { ticketNeedsCompletion } from "@/lib/tickets/pending-completion";

type TicketActionMenuProps = {
  ticket: TicketView | null;
  viewport: { top: number; left: number } | null;
  role: UserRole;
  isReadOnly?: boolean;
  onOpenStatusChange: (ticketId: string, nextStatus: TicketStatus) => void;
  onOpenAssign: (ticketId: string, currentTechnicianId: string | null) => void;
  onOpenEdit?: (ticketId: string) => void;
  onOpenCompleteDraft?: (ticketId: string) => void;
  onOpenDelete?: (ticketId: string, ticketTitle: string) => void;
  onOpenRequestDeletion?: (ticketId: string, ticketTitle: string) => void;
  actorUserId?: string;
};

export function TicketActionMenu({
  ticket,
  viewport,
  role,
  isReadOnly = false,
  onOpenStatusChange,
  onOpenAssign,
  onOpenEdit,
  onOpenCompleteDraft,
  onOpenDelete,
  onOpenRequestDeletion,
  actorUserId,
}: TicketActionMenuProps) {
  if (!ticket || !viewport) return null;
  const isPendingComplete = ticketNeedsCompletion(ticket);
  const owned = actorUserId ? isTicketOwnedByActor(ticket, actorUserId) : false;
  const canDelete = canSoftDeleteTicket(role);
  const canRequestDelete = canRequestTicketDeletion(role) && owned && Boolean(onOpenRequestDeletion);
  const transitions = isPendingComplete ? [] : getAllowedTransitions(role, ticket.status, isReadOnly);
  const showEdit =
    !isPendingComplete && canShowTicketEdit(role, ticket.status, isReadOnly, false, actorUserId, ticket);
  const showCompleteDraft =
    isPendingComplete &&
    canEditTicket(role, isReadOnly) &&
    (!actorUserId || canShowTicketEdit(role, ticket.status, isReadOnly, true, actorUserId, ticket)) &&
    Boolean(onOpenCompleteDraft ?? onOpenEdit);

  return createPortal(
    <motion.ul
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
      variants={fadeScale}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={motionTransition(0.15)}
    >
      {transitions.map((nextStatus) => (
        <li key={`${ticket.id}-${nextStatus}`} role="none">
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-xs text-[var(--color-text-2)] transition-colors duration-200 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
            onClick={() => onOpenStatusChange(ticket.id, nextStatus)}
          >
            {statusTransitionLabel(ticket.status, nextStatus)}
          </button>
        </li>
      ))}
      {showCompleteDraft ? (
        <li role="none">
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-amber-100 transition-colors duration-200 hover:bg-amber-500/10"
            onClick={() => (onOpenCompleteDraft ?? onOpenEdit)?.(ticket.id)}
          >
            <Pencil size={13} className="shrink-0 opacity-80" aria-hidden />
            Completar datos…
          </button>
        </li>
      ) : null}
      {showEdit && onOpenEdit ? (
        <>
          {transitions.length > 0 ? (
            <li role="none">
              <hr className="my-1 border-[var(--color-border)]" />
            </li>
          ) : null}
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text-2)] transition-colors duration-200 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
              onClick={() => onOpenEdit(ticket.id)}
            >
              <Pencil size={13} className="shrink-0 opacity-80" aria-hidden />
              Corregir datos…
            </button>
          </li>
        </>
      ) : null}
      {canAssignTicket(role) && ticket.status !== "resuelto" && !isPendingComplete && (
        <>
          {(transitions.length > 0 || showEdit) && (
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
      <li role="none">
        <hr className="my-1 border-[var(--color-border)]" />
      </li>
      <li role="none">
        <a
          role="menuitem"
          href={ticketIncidentDocUrl(ticket.id)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text-2)] transition-colors duration-200 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
        >
          <Download size={13} className="shrink-0 opacity-80" aria-hidden />
          Descargar parte (.docx)
        </a>
      </li>
      {canDelete && onOpenDelete ? (
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
      ) : null}
      {canRequestDelete ? (
        <>
          <li role="none">
            <hr className="my-1 border-[var(--color-border)]" />
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-amber-200 transition-colors duration-200 hover:bg-amber-500/10 hover:text-amber-100"
              onClick={() => onOpenRequestDeletion!(ticket.id, ticket.title)}
            >
              Solicitar eliminación…
            </button>
          </li>
        </>
      ) : null}
    </motion.ul>,
    document.body,
  );
}
