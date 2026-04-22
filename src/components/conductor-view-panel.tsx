"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Ticket } from "@/lib/domain";

type TicketRow = Ticket & { operator: string };

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

  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-subheading">Vista simplificada para conductores</h2>
        <p className="mt-1 text-sm text-[var(--color-text-3)]">Estado rápido de incidencias y acceso directo al detalle.</p>
      </section>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {tickets.slice(0, 20).map((ticket) => (
          <article key={ticket.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-xs text-[var(--color-text-3)]">
              {ticket.busId} · {ticket.operator}
            </p>
            <h3 className="mt-1 text-sm font-semibold text-[var(--color-text-1)]">{ticket.title}</h3>
            <p className="mt-1 text-xs text-[var(--color-text-2)]">{ticket.description}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-text-3)]">
              <span>Estado: {ticket.status}</span>
              <Link href={`/tickets/${ticket.id}`} className="text-[var(--color-accent)] hover:underline">
                Ver
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
