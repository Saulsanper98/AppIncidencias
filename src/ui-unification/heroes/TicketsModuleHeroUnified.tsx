"use client";

import { Inbox, Plus, Ticket as TicketIcon, Timer } from "lucide-react";
import Link from "next/link";

import { SectionTabs } from "@/components/ui/section-tabs";
import { KpiPill } from "@/components/ui/kpi-pill";
import { HeroShell } from "@/components/ui/hero-shell";
import { cn } from "@/lib/utils";

type TicketsModuleView = "full" | "bandeja" | "manage";

function BandejaKpiRow({
  total,
  borradores,
  abiertos,
  enProceso,
  esperandoRepuesto,
  resueltosHoy,
  slaVencidos,
}: {
  total: number;
  borradores: number;
  abiertos: number;
  enProceso: number;
  esperandoRepuesto: number;
  resueltosHoy: number;
  slaVencidos: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border)]/50 pt-3">
      <KpiPill label="Total" value={total} tone="neutral" compact />
      {borradores > 0 ? <KpiPill label="Pend." value={borradores} tone="warning" compact /> : null}
      <KpiPill label="Abiertos" value={abiertos} tone="info" compact />
      <KpiPill label="Proceso" value={enProceso} tone="accent" compact />
      {esperandoRepuesto > 0 ? <KpiPill label="Espera" value={esperandoRepuesto} tone="warning" compact /> : null}
      {resueltosHoy > 0 ? <KpiPill label="Hoy" value={resueltosHoy} tone="success" compact /> : null}
      {slaVencidos > 0 ? (
        <KpiPill label="SLA" value={slaVencidos} tone="error" pulse icon={<Timer size={11} strokeWidth={1.8} aria-hidden />} compact />
      ) : null}
    </div>
  );
}

function ModuleCta({
  href,
  icon: Icon,
  label,
  hint,
  secondary,
}: {
  href: string;
  icon: typeof Plus;
  label: string;
  hint: string;
  secondary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all hover:-translate-y-px",
        secondary
          ? "border-[var(--color-border)] bg-[var(--color-surface-2)]/80 hover:border-[var(--color-border-hover)]"
          : "border-[color-mix(in_oklab,var(--color-accent)_30%,transparent)] bg-[var(--color-accent-light)] hover:shadow-md",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          secondary ? "bg-[var(--color-surface-3)] text-[var(--color-text-2)]" : "bg-[var(--color-accent)]/20 text-[var(--color-accent)]",
        )}
      >
        <Icon size={16} strokeWidth={1.7} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-[var(--color-text-1)]">{label}</span>
        <span className="block text-[10px] text-[var(--color-text-3)]">{hint}</span>
      </span>
    </Link>
  );
}

export function TicketsModuleHeroUnified({
  view,
  total,
  abiertos,
  borradores = 0,
  enProceso,
  esperandoRepuesto,
  resueltosHoy,
  slaVencidos,
  maintenanceAlertsCount = 0,
  preventiveTasksCount = 0,
}: {
  view: TicketsModuleView;
  total: number;
  abiertos: number;
  borradores?: number;
  enProceso: number;
  esperandoRepuesto: number;
  resueltosHoy: number;
  slaVencidos: number;
  maintenanceAlertsCount?: number;
  preventiveTasksCount?: number;
}) {
  const isManage = view === "manage";
  const isBandeja = view === "bandeja";

  const title = isManage ? "Gestión de tickets" : "Bandeja de tickets";
  const subtitle = isManage
    ? "Apunte express en llamada. Despliega el formulario completo si necesitas tipología, adjuntos o ubicación."
    : "Sigue, asigna y cierra incidencias del centro de control.";

  return (
    <HeroShell
      variant="ccmgc-hero uiu-page-hero"
      className="mb-4 shadow-sm"
      dotColor="var(--hero-accent-operacion)"
      eyebrow={
        <span className="inline-flex items-center gap-2">
          <TicketIcon size={12} strokeWidth={1.8} aria-hidden />
          CCMGC · Operación
        </span>
      }
      title={title}
      subtitle={subtitle}
      actions={
        <>
          {isManage ? <SectionTabs preset="tickets" size="sm" className="border-b-0 pb-0" /> : null}
          {isBandeja ? (
            <ModuleCta href="/tickets" icon={Plus} label="Nuevo ticket" hint="Alta de incidencia" />
          ) : null}
          {isManage ? (
            <ModuleCta href="/bandeja" icon={Inbox} label="Bandeja completa" hint="Listado en vivo" secondary />
          ) : null}
          {isManage ? (
            <div className="flex flex-wrap gap-1.5">
              <KpiPill label="Abiertos" value={abiertos} tone="info" compact />
              <KpiPill label="Alertas" value={maintenanceAlertsCount} tone="warning" compact />
              <KpiPill label="Preventivas" value={preventiveTasksCount} tone="accent" compact />
            </div>
          ) : null}
        </>
      }
      kpis={
        isBandeja ? (
          <BandejaKpiRow
            total={total}
            borradores={borradores}
            abiertos={abiertos}
            enProceso={enProceso}
            esperandoRepuesto={esperandoRepuesto}
            resueltosHoy={resueltosHoy}
            slaVencidos={slaVencidos}
          />
        ) : undefined
      }
    />
  );
}
