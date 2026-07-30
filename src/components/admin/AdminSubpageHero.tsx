import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { cn } from "@/lib/utils";

export type AdminSubpageTone = "operacion" | "salud" | "admin";

const TONE_STYLES: Record<
  AdminSubpageTone,
  { hero: string; glow: string; icon: string; dot: string }
> = {
  operacion: {
    hero: "admin-subpage-hero admin-subpage-hero--operacion",
    glow: "admin-subpage-hero__glow admin-subpage-hero__glow--operacion",
    icon: "bg-amber-500/12 text-amber-300 ring-amber-500/25",
    dot: "var(--hero-accent-operacion)",
  },
  salud: {
    hero: "admin-subpage-hero admin-subpage-hero--salud",
    glow: "admin-subpage-hero__glow admin-subpage-hero__glow--salud",
    icon: "bg-cyan-500/12 text-cyan-300 ring-cyan-500/25",
    dot: "#22d3ee",
  },
  admin: {
    hero: "admin-subpage-hero admin-subpage-hero--admin",
    glow: "admin-subpage-hero__glow admin-subpage-hero__glow--admin",
    icon: "bg-fuchsia-500/12 text-fuchsia-300 ring-fuchsia-500/25",
    dot: "var(--hero-accent-admin)",
  },
};

type AdminSubpageHeroProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone?: AdminSubpageTone;
  kpis?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function AdminSubpageHero({
  title,
  subtitle,
  icon: Icon,
  tone = "admin",
  kpis,
  actions,
  backHref = "/admin",
  backLabel = "Volver al panel",
}: AdminSubpageHeroProps) {
  const styles = TONE_STYLES[tone];

  return (
    <header className={cn(styles.hero, "ccmgc-stagger-in ccmgc-stagger-in-1")}>
      <div aria-hidden className={styles.glow} />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex w-full min-w-0 items-start gap-3 sm:flex-1">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1",
              styles.icon,
            )}
          >
            <Icon size={18} strokeWidth={1.7} aria-hidden />
          </div>
          <div className="min-w-0">
            <SectionEyebrow pulse dotColor={styles.dot}>
              CCMGC · Administración
            </SectionEyebrow>
            <h1 className="dashboard-hero-title mt-1 text-balance">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-3)]">{subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-2)] transition-colors hover:border-[color-mix(in_oklab,var(--color-accent)_35%,var(--color-border))] hover:text-[var(--color-accent)]"
          >
            <ArrowLeft size={12} aria-hidden />
            {backLabel}
          </Link>
        </div>
      </div>
      {kpis ? <div className="relative mt-4 flex flex-wrap gap-2">{kpis}</div> : null}
    </header>
  );
}
