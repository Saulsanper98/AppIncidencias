"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bus, GitBranch, Ticket } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  busId: string;
  lineaLabel?: string;
  /** Sin borde ni fondo — para incrustar en bloques colapsables del formulario. */
  plain?: boolean;
};

export function BusOperationalContextPanel({ busId, lineaLabel, plain = false }: Props) {
  const [data, setData] = useState<{
    tickets: { id: string; title: string; status: string; priority: string }[];
    desvios: { id: string; titulo: string; referencia: string; estado: string }[];
  } | null>(null);

  useEffect(() => {
    const trimmed = busId.trim();
    if (!trimmed) {
      setData(null);
      return;
    }
    const q = lineaLabel?.trim() ? `?linea=${encodeURIComponent(lineaLabel.trim())}` : "";
    void (async () => {
      const res = await fetch(`/api/tickets/context/${encodeURIComponent(trimmed)}${q}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      setData(await res.json());
    })();
  }, [busId, lineaLabel]);

  if (!data || (data.tickets.length === 0 && data.desvios.length === 0)) return null;

  return (
    <section
      className={
        plain
          ? "space-y-2"
          : "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/25 p-3"
      }
    >
      <h4 className={cn("flex items-center gap-1.5 text-eyebrow", plain ? "mb-1" : "mb-2")}>
        <Bus size={13} aria-hidden />
        Contexto operativo · {busId.trim()}
      </h4>
      {data.tickets.length > 0 ? (
        <div className="mb-2">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
            <Ticket size={11} aria-hidden /> Tickets abiertos
          </p>
          <ul className="space-y-0.5">
            {data.tickets.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className="text-[12px] text-[var(--color-accent)] hover:underline">
                  {t.title}
                </Link>
                <span className="ml-1 text-[10px] text-[var(--color-text-3)]">{t.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.desvios.length > 0 ? (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
            <GitBranch size={11} aria-hidden /> Desvíos activos
          </p>
          <ul className="space-y-0.5">
            {data.desvios.slice(0, 4).map((d) => (
              <li key={d.id}>
                <Link href={`/desvios/${d.id}`} className="text-[12px] text-[var(--color-accent)] hover:underline">
                  {d.titulo}
                </Link>
                <span className="ml-1 text-[10px] text-[var(--color-text-3)]">{d.estado}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
