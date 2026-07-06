"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssetType } from "@/lib/domain";

type StockRow = {
  assetType: AssetType;
  partCode: string;
  partName: string;
  totalAvailable: number;
  totalReserved: number;
  minimumLevel: number;
  status: "ok" | "bajo" | "agotado";
  ticketCount: number;
};

const ASSET_ES: Record<AssetType, string> = {
  validadora: "Validadora",
  sae: "SAE",
  router: "Router",
  pantalla: "Pantalla",
};

export function InventoryCompactWidget() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch("/api/inventory/summary", { cache: "no-store", credentials: "include" });
    if (!res.ok) {
      setErr("No se pudo cargar el inventario");
      setRows([]);
      return;
    }
    const data = (await res.json()) as { summary?: StockRow[] };
    const list = data.summary ?? [];
    const critical = list.filter((r) => r.status !== "ok");
    const head = critical.length ? critical.slice(0, 10) : list.slice(0, 8);
    setRows(head);
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
    return <Skeleton className="h-24 rounded-lg" />;
  }

  if (err) {
    return <p className="text-xs text-[var(--color-error)]">{err}</p>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--color-text-3)]">Resumen de piezas</span>
        <Link href="/inventory" className="shrink-0 text-[11px] font-medium text-[var(--color-accent)] hover:underline">
          Inventario completo
        </Link>
      </div>
      <div className="min-h-0 overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[420px] text-left text-[11px]">
          <thead className="text-[10px] uppercase text-[var(--color-text-3)]">
            <tr>
              <th className="border-b border-[var(--color-border)] pb-1.5 pr-2">Pieza</th>
              <th className="border-b border-[var(--color-border)] pb-1.5 pr-2">Tipo</th>
              <th className="border-b border-[var(--color-border)] pb-1.5 pr-2">Disp.</th>
              <th className="border-b border-[var(--color-border)] pb-1.5">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.partCode} className="border-b border-[var(--color-border)]/60 last:border-0">
                <td className="py-1.5 pr-2 align-top">
                  <span className="font-mono text-[var(--color-text-1)]">{r.partCode}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[10px] text-[var(--color-text-3)]">{r.partName}</span>
                </td>
                <td className="py-1.5 pr-2 align-top text-[var(--color-text-2)]">{ASSET_ES[r.assetType]}</td>
                <td className="py-1.5 pr-2 align-top tabular-nums">{r.totalAvailable}</td>
                <td className="py-1.5 align-top">
                  <Badge
                    variant={r.status === "agotado" ? "error" : r.status === "bajo" ? "warning" : "success"}
                    className="text-[10px]"
                  >
                    {r.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
