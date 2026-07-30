"use client";

import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";

type ChartEmptyStateProps = {
  title: string;
  action?: string;
  className?: string;
  children?: ReactNode;
};

export function ChartEmptyState({ title, action, className, children }: ChartEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-8 text-center",
        className,
      )}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        style={{
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <BarChart3 size={20} className="text-[var(--color-text-3)]" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-[var(--color-text-2)]">{title}</p>
        {action ? <p className="mx-auto max-w-[280px] text-[11px] leading-relaxed text-[var(--color-text-3)]">{action}</p> : null}
      </div>
      {children}
    </div>
  );
}
