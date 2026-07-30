"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type HealthDash = {
  pollerRunning: boolean;
  pollerLastError: string | null;
  activeDesvios: number;
  openTickets: number;
  unassignedAged: number;
};

export function DashboardHealthWidget() {
  const [data, setData] = useState<HealthDash | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/operations/health-dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error("fail");
        setData((await res.json()) as HealthDash);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <p className="text-sm text-[var(--color-text-3)]">Cargando salud operativa…</p>;
  if (!data) return <p className="text-sm text-[var(--color-text-3)]">Salud operativa no disponible</p>;

  const items = [
    {
      label: "Poller desvíos",
      value: data.pollerRunning ? "Activo" : "Parado",
      ok: data.pollerRunning && !data.pollerLastError,
    },
    { label: "Desvíos activos", value: String(data.activeDesvios), ok: data.activeDesvios === 0 },
    { label: "Tickets abiertos", value: String(data.openTickets), ok: data.openTickets < 25 },
    { label: "Sin asignar +30m", value: String(data.unassignedAged), ok: data.unassignedAged === 0 },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              "rounded-lg border px-3 py-2",
              item.ok
                ? "border-emerald-500/25 bg-emerald-500/5"
                : "border-amber-500/30 bg-amber-500/8",
            )}
          >
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-3)]">{item.label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--color-text-1)]">{item.value}</p>
          </div>
        ))}
      </div>
      {data.pollerLastError ? (
        <p className="text-[11px] text-[var(--color-error)]">Poller: {data.pollerLastError}</p>
      ) : null}
      <Link href="/admin/salud" className="text-[11px] font-medium text-[var(--color-accent)] hover:underline">
        Ver salud completa →
      </Link>
    </div>
  );
}
