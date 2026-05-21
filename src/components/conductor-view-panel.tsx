"use client";

import { AlertCircle, CheckCircle2, ChevronRight, Clock, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { Ticket } from "@/lib/domain";
import { cn } from "@/lib/utils";

type TicketRow = Ticket & { operator: string };

const STATUS_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  abierto:             { label: "Abierto",          icon: AlertCircle,   color: "text-[var(--color-error)]",   bg: "bg-[var(--color-error-light)]",   border: "var(--color-error)" },
  en_proceso:          { label: "En proceso",        icon: Clock,         color: "text-[var(--color-warning)]", bg: "bg-[var(--color-warning-light)]", border: "var(--color-warning)" },
  esperando_repuesto:  { label: "Esp. repuesto",     icon: TriangleAlert, color: "text-[var(--color-accent)]",  bg: "bg-[var(--color-accent-light)]",  border: "var(--color-accent)" },
  resuelto:            { label: "Resuelto",           icon: CheckCircle2, color: "text-[var(--color-success)]", bg: "bg-[var(--color-success-light)]", border: "var(--color-success)" },
};

export function ConductorViewPanel() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/tickets?status=todos&operator=todas&busId=todas", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { tickets: TicketRow[] };
        setTickets(data.tickets ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <Loader2 size={24} className="animate-spin text-[var(--color-text-3)]" />
      </div>
    );
  }

  if (!tickets.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-16 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success-light)]">
          <CheckCircle2 size={24} className="text-[var(--color-success)]" />
        </div>
        <p className="font-medium text-[var(--color-text-2)]">Sin incidencias activas</p>
        <p className="mt-1 text-sm text-[var(--color-text-3)]">Todo en orden por ahora</p>
      </div>
    );
  }

  const open = tickets.filter((t) => t.status !== "resuelto");
  const resolved = tickets.filter((t) => t.status === "resuelto");

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div
        className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4"
        style={{ background: "radial-gradient(ellipse at 90% 0%, rgba(37,99,235,0.07) 0%, transparent 55%), var(--color-surface)" }}
      >
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-1)]">Vista conductor</h2>
          <p className="mt-0.5 text-sm text-[var(--color-text-2)]">Acceso rápido a tus incidencias y estado de la flota.</p>
        </div>
        <div className="flex gap-4 text-sm">
          {open.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-error)]" />
              <span className="font-bold text-[var(--color-text-1)]">{open.length}</span>
              <span className="text-[var(--color-text-3)]">abiertas</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
            <span className="font-bold text-[var(--color-text-1)]">{resolved.length}</span>
            <span className="text-[var(--color-text-3)]">resueltas</span>
          </div>
        </div>
      </div>

      {/* Ticket grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {tickets.slice(0, 20).map((ticket) => {
          const sm = STATUS_META[ticket.status] ?? STATUS_META.abierto;
          const Icon = sm.icon;
          return (
            <Link
              key={ticket.id}
              href={`/tickets/${ticket.id}`}
              className="group flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 transition-all duration-150 hover:border-[var(--color-border-hover)] hover:shadow-md hover:shadow-black/15"
              style={{ borderLeftWidth: "3px", borderLeftColor: sm.border }}
            >
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", sm.bg)}>
                <Icon size={15} className={sm.color} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs font-semibold text-[var(--color-accent)]">{ticket.busId}</p>
                  <span className={cn("text-[11px] font-medium", sm.color)}>{sm.label}</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-medium text-[var(--color-text-1)]">{ticket.title}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-3)]">{ticket.description}</p>
                <p className="mt-1 text-xs text-[var(--color-text-3)]">{ticket.operator}</p>
              </div>
              <ChevronRight size={14} className="mt-1 shrink-0 text-[var(--color-text-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
