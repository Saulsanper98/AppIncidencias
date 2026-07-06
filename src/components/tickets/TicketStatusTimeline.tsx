"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  abierto: "Abierto",
  en_proceso: "En proceso",
  esperando_repuesto: "Esperando repuesto",
  resuelto: "Resuelto",
};

type HistoryRow = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedByName: string;
  comment: string | null;
  createdAt: string;
};

export function TicketStatusTimeline({ ticketId }: { ticketId: string }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/status-history`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { history: HistoryRow[] };
      setRows(data.history ?? []);
    })();
  }, [ticketId]);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 p-3">
      <h4 className="mb-2 text-eyebrow">Historial de estados</h4>
      <ol className="relative space-y-0 border-l border-[var(--color-border)] pl-4">
        {rows.map((row, i) => {
          const isLast = i === rows.length - 1;
          return (
            <li key={row.id} className="relative pb-3 last:pb-0">
              <span
                className={cn(
                  "absolute -left-[1.35rem] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-surface)]",
                  isLast ? "text-[var(--color-accent)]" : "text-[var(--color-success)]",
                )}
                aria-hidden
              >
                {isLast ? <Circle size={10} fill="currentColor" /> : <CheckCircle2 size={14} />}
              </span>
              <p className="text-[12px] font-semibold text-[var(--color-text-1)]">
                {row.fromStatus
                  ? `${STATUS_LABEL[row.fromStatus] ?? row.fromStatus} → ${STATUS_LABEL[row.toStatus] ?? row.toStatus}`
                  : `Creado · ${STATUS_LABEL[row.toStatus] ?? row.toStatus}`}
              </p>
              <p className="text-[11px] text-[var(--color-text-3)]">
                {row.changedByName} · {new Date(row.createdAt).toLocaleString("es-ES")}
              </p>
              {row.comment ? <p className="mt-0.5 text-[11px] text-[var(--color-text-2)]">{row.comment}</p> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
