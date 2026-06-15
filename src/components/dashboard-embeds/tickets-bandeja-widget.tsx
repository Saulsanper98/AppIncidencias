"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { Ticket, TicketStatus } from "@/lib/domain";

type Row = Ticket & { operator: string; municipio?: string };

const statusVariant: Record<TicketStatus, "error" | "warning" | "info" | "success"> = {
  abierto: "error",
  en_proceso: "warning",
  esperando_repuesto: "info",
  resuelto: "success",
};

export function TicketsBandejaWidget() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch("/api/tickets?status=todos&operator=todas&busId=todas", {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) {
      setErr("No se pudo cargar la bandeja");
      setRows([]);
      return;
    }
    const data = (await res.json()) as { tickets?: Row[] };
    const list = data.tickets ?? [];
    setRows(list.slice(0, 15));
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  if (loading) {
    return <div className="h-24 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />;
  }

  if (err) {
    return <p className="text-xs text-[var(--color-error)]">{err}</p>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--color-text-3)]">Últimos tickets (vista compacta)</p>
        <Link
          href="/bandeja"
          className="shrink-0 text-[11px] font-medium text-[var(--color-accent)] hover:underline"
        >
          Bandeja completa
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-text-3)]">No hay tickets.</p>
      ) : (
        <div className="min-h-0 overflow-x-auto overflow-y-auto [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[520px] text-left text-[11px]">
            <thead className="text-[10px] uppercase text-[var(--color-text-3)]">
              <tr>
                <th className="border-b border-[var(--color-border)] pb-1.5 pr-2">Ticket</th>
                <th className="border-b border-[var(--color-border)] pb-1.5 pr-2">Bus</th>
                <th className="border-b border-[var(--color-border)] pb-1.5 pr-2">Título</th>
                <th className="border-b border-[var(--color-border)] pb-1.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-[var(--color-border)]/60 last:border-0">
                  <td className="py-1.5 pr-2 align-top">
                    <Link href={`/tickets/${t.id}`} className="font-mono text-[var(--color-accent)] hover:underline">
                      {t.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="py-1.5 pr-2 align-top text-[var(--color-text-2)]">
                    <span className="whitespace-nowrap">{t.busId}</span>
                    <span className="mt-0.5 block text-[10px] text-[var(--color-text-3)]">{t.operator}</span>
                  </td>
                  <td className="max-w-[14rem] py-1.5 pr-2 align-top text-[var(--color-text-1)]">
                    <span className="line-clamp-2">{t.title}</span>
                  </td>
                  <td className="py-1.5 align-top">
                    <Badge variant={statusVariant[t.status] ?? "neutral"} className="text-[10px]">
                      {t.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
