"use client";

import type { LucideIcon } from "lucide-react";
import { NotebookPen } from "lucide-react";

import { BitacoraNewEntryButton } from "@/components/bitacora/BitacoraUi";
import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { HeroShell } from "@/components/ui/hero-shell";
import { KpiPill } from "@/components/ui/kpi-pill";
import { SHIFT_LABEL, shiftWindowLabel, type ShiftKey } from "@/lib/shift-utils";

export function BitacoraHero({
  stats,
  activeShift,
  ShiftIcon,
  onNewEntry,
}: {
  stats: { total: number; alerta: number; pendiente: number };
  activeShift: ShiftKey;
  ShiftIcon: LucideIcon;
  onNewEntry: () => void;
}) {
  return (
    <HeroShell
      variant="ccmgc-hero ccmgc-hero--conocimiento"
      className="!mb-0"
      dotColor="var(--hero-accent-conocimiento)"
      eyebrow={
        <span className="inline-flex items-center gap-2">
          <NotebookPen size={12} strokeWidth={1.8} aria-hidden />
          CCMGC · Conocimiento
        </span>
      }
      title="Bitácora de turno"
      subtitle="Notas para jefatura y el relevo, sin abrir incidencia."
      actions={
        <>
          <div
            className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--color-success)_35%,transparent)] bg-[var(--color-success-light)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-success)]"
            title="Turno en curso"
          >
            <ShiftIcon size={14} strokeWidth={2} aria-hidden />
            {SHIFT_LABEL[activeShift]} · {shiftWindowLabel(activeShift)}
          </div>
          <BitacoraNewEntryButton onClick={onNewEntry} />
          <FeedbackTargetButton id="bitacora" label="Bitácora de turno" />
        </>
      }
      kpis={
        <>
          <KpiPill layout="stacked" compact label="Entradas" value={stats.total} />
          <KpiPill layout="stacked" compact label="Alertas" value={stats.alerta} tone="error" />
          <KpiPill layout="stacked" compact label="Pendientes" value={stats.pendiente} tone="warning" />
        </>
      }
    />
  );
}
