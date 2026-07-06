"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function DashboardCriticalChip({
  slaVencidos,
  altaPrioridad,
  loading,
  className,
}: {
  slaVencidos: number;
  altaPrioridad: number;
  loading: boolean;
  className?: string;
}) {
  if (loading || (slaVencidos === 0 && altaPrioridad === 0)) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      aria-label="Alertas operativas urgentes"
    >
      {slaVencidos > 0 ? (
        <Link
          href="/bandeja"
          className="desvios-action-chip desvios-action-chip--danger !h-7 animate-pulse font-semibold"
          title="Incidencias activas fuera de plazo SLA"
        >
          <AlertTriangle size={12} strokeWidth={2} aria-hidden />
          <span className="tabular-nums">{slaVencidos}</span>
          <span>fuera SLA</span>
        </Link>
      ) : null}
      {altaPrioridad > 0 ? (
        <Link
          href="/bandeja?priority=alta"
          className="desvios-action-chip desvios-action-chip--danger !h-7 font-semibold"
          title="Tickets activos de prioridad alta"
        >
          <span className="tabular-nums">{altaPrioridad}</span>
          <span>alta</span>
        </Link>
      ) : null}
    </div>
  );
}
