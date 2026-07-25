"use client";

import { Route, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type DesvioRow = {
  id: string;
  titulo: string;
  lineas_afectadas: string[];
  estado: string;
};

type Props = {
  onLineFilter?: (linea: string | null) => void;
  activeLineFilter?: string | null;
};

export function MapActiveDesviosStrip({ onLineFilter, activeLineFilter }: Props) {
  const [items, setItems] = useState<DesvioRow[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/desvios?estado=ACTIVO&pageSize=20", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: DesvioRow[] };
      setItems(data.items ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 120_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (collapsed || items.length === 0) {
    if (items.length === 0) return null;
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="mb-2 flex w-full items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-100"
      >
        <Route size={14} aria-hidden />
        {items.length} desvío{items.length === 1 ? "" : "s"} activo{items.length === 1 ? "" : "s"} en red
      </button>
    );
  }

  const lineas = Array.from(
    new Set(items.flatMap((d) => d.lineas_afectadas ?? [])),
  ).slice(0, 12);

  return (
    <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-100">
          <Route size={14} aria-hidden />
          Desvíos activos ({items.length})
        </p>
        <div className="flex items-center gap-1">
          <Link href="/desvios?estado=ACTIVO" className="text-[10px] text-amber-200 hover:underline">
            Ver todos
          </Link>
          <button type="button" onClick={() => setCollapsed(true)} className="rounded p-0.5 text-amber-200 hover:bg-amber-500/20">
            <X size={12} aria-hidden />
          </button>
        </div>
      </div>
      {lineas.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {lineas.map((linea) => (
            <button
              key={linea}
              type="button"
              onClick={() => onLineFilter?.(activeLineFilter === linea ? null : linea)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                activeLineFilter === linea
                  ? "border-amber-300 bg-amber-400/25 text-amber-50"
                  : "border-amber-500/25 text-amber-100 hover:bg-amber-500/15",
              )}
            >
              Línea {linea}
            </button>
          ))}
        </div>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {items.slice(0, 3).map((d) => (
            <li key={d.id}>
              <Link href={`/desvios/${d.id}`} className="text-[10px] text-amber-100 hover:underline">
                {d.titulo}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
