import type { ReactNode } from "react";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { cn } from "@/lib/utils";

type HeroShellProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  kpis?: ReactNode;
  /** Modificador hero: reports-hero, desvios-hero, ccmgc-hero, etc. */
  variant?: string;
  pulse?: boolean;
  dotColor?: string;
  className?: string;
  staggerIndex?: 1 | 2 | 3 | 4 | 5 | 6;
};

/** Hero operativo unificado (Ola 4 #535). */
export function HeroShell({
  eyebrow,
  title,
  subtitle,
  actions,
  kpis,
  variant = "ccmgc-hero",
  pulse = true,
  dotColor,
  className,
  staggerIndex = 1,
}: HeroShellProps) {
  return (
    <header
      className={cn(
        variant,
        "relative mb-5 overflow-hidden rounded-2xl border border-[var(--color-border)] p-4 sm:p-5",
        staggerIndex && `ccmgc-stagger-in ccmgc-stagger-in-${staggerIndex}`,
        className,
      )}
    >
      <div className="relative z-[1] flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <SectionEyebrow pulse={pulse} dotColor={dotColor}>
            {eyebrow}
          </SectionEyebrow>
          <h1 className="dashboard-hero-title text-balance">{title}</h1>
          {subtitle ? (
            <p className="max-w-2xl text-sm text-[var(--color-text-3)]">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {kpis ? <div className="relative z-[1] mt-4 flex flex-wrap gap-2">{kpis}</div> : null}
    </header>
  );
}
