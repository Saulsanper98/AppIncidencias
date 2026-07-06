"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

type Duplicate = {
  id: string;
  title: string;
  busId: string;
  status: string;
  priority: string;
  score: number;
};

type Props = {
  busId: string;
  title: string;
  description: string;
  tipo?: string;
  subtipo?: string;
};

export function TicketDuplicateAlert({ busId, title, description, tipo, subtipo }: Props) {
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);

  useEffect(() => {
    const probe = `${title} ${description}`.trim();
    if (!busId.trim() || probe.length < 6) {
      setDuplicates([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const q = new URLSearchParams({
          busId: busId.trim(),
          title,
          description,
          ...(tipo ? { tipo } : {}),
          ...(subtipo ? { subtipo } : {}),
        });
        const res = await fetch(`/api/tickets/duplicates?${q}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { duplicates: Duplicate[] };
        setDuplicates(data.duplicates ?? []);
      } catch {
        /* ignorar */
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [busId, title, description, tipo, subtipo]);

  if (duplicates.length === 0) return null;

  return (
    <div className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[var(--color-warning-light)]/40 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-warning)]">
        <AlertTriangle size={14} aria-hidden />
        ¿Es un ticket duplicado?
      </p>
      <ul className="mt-1.5 space-y-1">
        {duplicates.map((d) => (
          <li key={d.id}>
            <Link
              href={`/tickets/${d.id}`}
              className="block rounded-md px-2 py-1 text-[12px] text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <span className="font-medium text-[var(--color-text-1)]">{d.title}</span>
              <span className="ml-1 text-[var(--color-text-3)]">
                · {d.status} · {Math.round(d.score * 100)}% coincidencia
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
