"use client";

import Link from "next/link";
import { Fragment } from "react";

import { CountUp } from "@/components/ui/count-up";
import { kpiToneValueClass, type KpiTone } from "@/components/ui/kpi-pill";
import { cn } from "@/lib/utils";

export type KpiInlineStripItem = {
  key: string;
  label: string;
  /** Numérico (animado) o texto (p. ej. MTTR). */
  value?: number | string | null;
  suffix?: string;
  tone?: KpiTone;
  pulse?: boolean;
  title?: string;
  href?: string;
  loading?: boolean;
  /** Si true, muestra "—" cuando value es null/undefined. */
  emptyHint?: string;
};

export function KpiInlineStrip({
  items,
  className,
  ariaLabel,
  valueClassName,
}: {
  items: KpiInlineStripItem[];
  className?: string;
  ariaLabel?: string;
  valueClassName?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3", className)}
      aria-label={ariaLabel}
    >
      {items.map((item, index) => {
        const tone = item.tone ?? "neutral";
        const isNumeric = typeof item.value === "number";
        const isEmpty =
          !item.loading &&
          (item.value === null || item.value === undefined || item.value === "—");
        const valueContent = item.loading ? (
          "…"
        ) : isNumeric ? (
          <>
            <CountUp value={item.value as number} durationMs={400} />
            {item.suffix ?? ""}
          </>
        ) : (
          <>
            {item.value ?? "—"}
            {item.suffix ?? ""}
          </>
        );

        const inner = (
          <span
            className={cn(
              "inline-flex items-baseline gap-1 whitespace-nowrap",
              item.pulse && "animate-pulse",
            )}
            title={item.title ?? (item.emptyHint && isEmpty ? item.emptyHint : `${item.value ?? "—"} ${item.label}`)}
          >
            <span
              className={cn(
                "text-[13px] font-bold tabular-nums leading-none sm:text-sm",
                isEmpty ? "text-[var(--color-text-3)]" : kpiToneValueClass(tone),
                valueClassName,
              )}
            >
              {valueContent}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
              {item.label}
            </span>
          </span>
        );

        return (
          <Fragment key={item.key}>
            {index > 0 ? (
              <span className="hidden h-3 w-px shrink-0 bg-[var(--color-border)]/50 sm:inline" aria-hidden />
            ) : null}
            {item.href ? (
              <Link href={item.href} className="rounded-md transition-opacity hover:opacity-85">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
