"use client";

import { Loader2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { useSseEvent } from "@/hooks/use-sse-event";
import {
  ticketStatusBadgeClassName,
  ticketStatusBadgeVariant,
} from "@/lib/ticket-ui";
import { cn } from "@/lib/utils";
import type { TicketStatus } from "@/lib/domain";

type DeletionRequestItem = {
  id: string;
  ticketId: string;
  reason: string;
  status: string;
  createdAt: string;
  requestedBy: { id: string; name: string };
  ticket: {
    id: string;
    title: string;
    busId: string;
    status: string;
    shortId: string;
  } | null;
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  borrador: "Pend. completar",
  abierto: "Abierto",
  en_proceso: "En proceso",
  esperando_repuesto: "Esp. repuesto",
  resuelto: "Resuelto",
};

function formatRequestDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function TicketDeletionRequestsPanel() {
  const [requests, setRequests] = useState<DeletionRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets/deletion-requests?status=pendiente", { cache: "no-store" });
      if (!res.ok) {
        setError("No se pudieron cargar las solicitudes");
        return;
      }
      const data = (await res.json()) as { requests: DeletionRequestItem[] };
      setRequests(data.requests ?? []);
    } catch {
      setError("No se pudieron cargar las solicitudes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSseEvent("ticket_deletion_requested", () => void load());
  useSseEvent("ticket_deleted", () => void load());
  useSseEvent("ticket_deletion_rejected", () => void load());

  const review = async (requestId: string, action: "approve" | "reject") => {
    setBusyId(requestId);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/deletion-requests/${encodeURIComponent(requestId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.message === "string" ? data.message : "No se pudo procesar la solicitud");
        return;
      }
      await load();
    } catch {
      setError("Error de red");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[12px] text-[var(--color-text-3)]"
        aria-busy="true"
      >
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Cargando solicitudes de borrado…
      </div>
    );
  }

  if (requests.length === 0) return null;

  return (
    <section
      className="account-section border-l-[3px] border-l-rose-500/55 shadow-sm"
      style={{ "--section-tone": "var(--color-warning)" } as CSSProperties}
      aria-labelledby="ticket-deletion-requests-title"
    >
      <header className="account-section-head !mb-3 !items-start sm:!items-center">
        <span className="account-section-icon shrink-0">
          <Trash2 size={16} strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="account-section-pretitle">
            <span className="account-section-pretitle-dot ccmgc-eyebrow-dot--pulse" aria-hidden />
            Gestión
          </p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 id="ticket-deletion-requests-title" className="account-section-title !mt-0">
              Solicitudes de eliminación
            </h3>
            <span className="inline-flex items-baseline gap-1 whitespace-nowrap" title={`${requests.length} pendientes`}>
              <span className="text-[13px] font-bold tabular-nums leading-none text-[var(--color-warning)] sm:text-sm">
                {requests.length}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
                Pendientes
              </span>
            </span>
          </div>
        </div>
      </header>

      {error ? (
        <p className="mb-3 rounded-lg border border-[var(--color-error)]/35 bg-[var(--color-error-light)] px-3 py-2 text-[12px] text-[var(--color-error)]" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="overflow-hidden rounded-xl border border-[var(--color-border)]/80 bg-[var(--color-surface-2)]/15 divide-y divide-[var(--color-border)]/55">
        {requests.map((r) => {
          const busy = busyId === r.id;
          const ticketStatus = r.ticket?.status as TicketStatus | undefined;
          const label = r.ticket
            ? `#${r.ticket.shortId} · ${r.ticket.busId} · ${r.ticket.title}`
            : `Ticket ${r.ticketId.slice(-8).toUpperCase()}`;
          return (
            <li key={r.id} className="px-4 py-3.5 sm:py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {ticketStatus ? (
                      <Badge
                        variant={ticketStatusBadgeVariant(ticketStatus)}
                        className={cn("shrink-0", ticketStatusBadgeClassName(ticketStatus))}
                      >
                        {STATUS_LABEL[ticketStatus] ?? ticketStatus}
                      </Badge>
                    ) : null}
                    {r.ticket ? (
                      <Link
                        href={`/tickets/${r.ticket.id}`}
                        className="min-w-0 text-[13px] font-semibold leading-snug text-[var(--color-accent)] hover:underline sm:text-sm"
                      >
                        {label}
                      </Link>
                    ) : (
                      <p className="text-[13px] font-semibold leading-snug text-[var(--color-text-1)] sm:text-sm">
                        {label}
                      </p>
                    )}
                  </div>

                  <p className="text-[11px] text-[var(--color-text-3)]">
                    Solicitado por{" "}
                    <span className="font-medium text-[var(--color-text-2)]">{r.requestedBy.name}</span>
                    <span className="mx-1.5 text-[var(--color-border)]" aria-hidden>
                      ·
                    </span>
                    {formatRequestDate(r.createdAt)}
                  </p>

                  <p className="rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-surface)]/70 px-3 py-2 text-[12px] leading-relaxed text-[var(--color-text-2)]">
                    {r.reason}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-stretch lg:pt-0.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void review(r.id, "reject")}
                    className="desvios-action-chip min-h-9 flex-1 sm:flex-none lg:min-w-[7.5rem]"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} strokeWidth={1.9} aria-hidden />}
                    Rechazar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`¿Aprobar y eliminar definitivamente este ticket?\n\n${label}`)) return;
                      void review(r.id, "approve");
                    }}
                    className="desvios-action-chip desvios-action-chip--danger min-h-9 flex-1 font-semibold sm:flex-none lg:min-w-[7.5rem]"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={1.9} aria-hidden />}
                    Aprobar
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
