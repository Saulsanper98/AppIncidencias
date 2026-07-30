"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type DesvioRow = {
  id: string;
  via: string;
  tramo: string;
  estado: string;
  lineas: string[];
};

export function DesviosCompactWidget() {
  const [rows, setRows] = useState<DesvioRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/desvios?estado=ACTIVO&pageSize=6", { cache: "no-store" });
        const payload = (await res.json()) as { items?: DesvioRow[] };
        setRows(payload.items ?? []);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) {
    return <p className="text-sm text-[var(--color-text-3)]">Cargando desvíos…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-4 text-center text-sm text-[var(--color-text-3)]">
        Sin desvíos activos
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((d) => (
        <li key={d.id}>
          <Link
            href={`/desvios?highlight=${d.id}`}
            className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 transition-colors hover:border-[var(--color-accent)]/40"
          >
            <p className="text-sm font-medium text-[var(--color-text-1)]">{d.via}</p>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--color-text-3)]">{d.tramo}</p>
            {d.lineas?.length ? (
              <p className="mt-1 text-[10px] text-[var(--color-accent)]">
                Líneas: {d.lineas.slice(0, 4).join(", ")}
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
