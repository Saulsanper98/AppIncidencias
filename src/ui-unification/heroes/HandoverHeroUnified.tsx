"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Handshake } from "lucide-react";
import type { ReactNode } from "react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { SectionTabs } from "@/components/ui/section-tabs";
import { HeroShell } from "@/components/ui/hero-shell";

export function HandoverHeroUnified({
  showSavedFlash,
  extra,
}: {
  showSavedFlash: boolean;
  extra?: ReactNode;
}) {
  return (
    <HeroShell
      variant="ccmgc-hero uiu-page-hero uiu-page-hero--handover"
      className="mb-0"
      dotColor="var(--hero-accent-conductor)"
      eyebrow={
        <span className="inline-flex items-center gap-2">
          <Handshake size={12} strokeWidth={1.8} aria-hidden />
          CCMGC · Operación
        </span>
      }
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Pase de turno
          <FeedbackTargetButton id="handover" label="Pase de turno" />
          <AnimatePresence>
            {showSavedFlash ? (
              <motion.span
                key="saved"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-light)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--color-success)]"
              >
                <CheckCircle2 size={11} aria-hidden />
                Guardado
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
      }
      subtitle="Entrega estructurada entre turnos: resumen, alertas, acciones pendientes y acuse de recibo."
      actions={<SectionTabs preset="tickets" size="sm" className="border-b-0 pb-0" />}
      kpis={extra}
    />
  );
}
