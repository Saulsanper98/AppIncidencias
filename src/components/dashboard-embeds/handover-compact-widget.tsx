"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type HandoverRow = {
  id: string;
  shiftDate: string;
  shift: string;
  authorName: string;
  createdAt: string;
  receivedByName: string | null;
  openPendingCount?: number;
  acknowledgedAt?: string | null;
};

export function HandoverCompactWidget() {
  const [rows, setRows] = useState<HandoverRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/handover?take=5", { cache: "no-store" });
        const payload = (await res.json()) as { items?: HandoverRow[] };
        setRows(payload.items ?? []);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <p className="text-sm text-[var(--color-text-3)]">Cargando pases de turno…</p>;

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-sm text-[var(--color-text-3)]">
        Sin pases de turno recientes
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((h) => {
        const openCount = h.openPendingCount ?? 0;
        return (
          <li key={h.id}>
            <Link
              href={
                openCount > 0
                  ? `/handover?tab=open_pending&focus=${encodeURIComponent(h.id)}`
                  : h.acknowledgedAt
                    ? `/handover?focus=${encodeURIComponent(h.id)}`
                    : `/handover?tab=unacked&focus=${encodeURIComponent(h.id)}`
              }
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 hover:border-[var(--color-accent)]/40"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-1)]">
                  Turno {h.shift} · {h.shiftDate}
                </p>
                <p className="text-[11px] text-[var(--color-text-3)]">{h.authorName}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-[10px] text-[var(--color-text-3)]">
                  {h.acknowledgedAt ? "Recibido" : "Pendiente"}
                </span>
                {openCount > 0 ? (
                  <span className="text-[10px] font-semibold text-[var(--color-warning)]">
                    {openCount} abiertas
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
