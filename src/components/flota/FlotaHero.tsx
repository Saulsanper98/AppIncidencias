"use client";

import { Bus as BusIcon } from "lucide-react";
import Link from "next/link";

import { HeroShell } from "@/components/ui/hero-shell";
import { KpiPill } from "@/components/ui/kpi-pill";

type FlotaHeroProps = {
  totalBuses: number;
  filteredCount: number;
  operatorCount: number;
  anomalousCount: number;
  canManage: boolean;
};

export function FlotaHero({
  totalBuses,
  filteredCount,
  operatorCount,
  anomalousCount,
  canManage,
}: FlotaHeroProps) {
  return (
    <HeroShell
      variant="ccmgc-hero ccmgc-hero--flota"
      dotColor="var(--color-accent)"
      eyebrow={
        <span className="inline-flex items-center gap-2">
          <BusIcon size={12} strokeWidth={1.8} aria-hidden />
          CCMGC · Flota
        </span>
      }
      title="Catálogo de flota"
      subtitle={
        <>
          Consulta buses, operadoras y líneas de servicio.
          {canManage ? (
            <>
              {" "}
              Gestión en{" "}
              <Link href="/admin/catalog" className="text-[var(--color-accent)] hover:underline">
                Administración → Catálogo
              </Link>
              .
            </>
          ) : null}
        </>
      }
      kpis={
        <>
          <KpiPill label="Buses" value={totalBuses} layout="stacked" tone="accent" compact />
          <KpiPill label="Operadoras" value={operatorCount} layout="stacked" compact />
          <KpiPill
            label="Anómalos"
            value={anomalousCount}
            layout="stacked"
            tone={anomalousCount > 0 ? "warning" : "success"}
            compact
          />
          <KpiPill
            label="Mostrando"
            value={filteredCount}
            layout="stacked"
            tone="info"
            compact
            hint={filteredCount !== totalBuses ? "Con filtros activos" : undefined}
          />
        </>
      }
    />
  );
}
