"use client";

import Link from "next/link";

import type { SlaUrgentTicket } from "@/lib/dashboard/dashboard-data-types";
import { cn } from "@/lib/utils";

type SlaUrgentListWidgetProps = {
  tickets: SlaUrgentTicket[];
};

function formatMinutesLeft(minutes: number): string {
  if (minutes < 0) return `Vencido ${Math.abs(minutes)} min`;
  if (minutes < 60) return `${minutes} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

export function SlaUrgentListWidget({ tickets }: SlaUrgentListWidgetProps) {
  if (tickets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-sm text-[var(--color-text-3)]">
        Sin tickets urgentes por SLA
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {tickets.map((t) => {
        const overdue = t.minutesLeft < 0;
        const urgent = !overdue && t.minutesLeft <= 60;
        return (
          <li key={t.id}>
            <Link
              href={`/tickets?highlight=${t.id}`}
              className={cn(
                "flex items-start justify-between gap-2 rounded-lg border px-3 py-2 transition-colors",
                overdue
                  ? "border-[var(--color-error)]/40 bg-[var(--color-error-light)]/30"
                  : urgent
                    ? "border-amber-500/35 bg-amber-500/8"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-accent)]/40",
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--color-text-1)]">{t.title}</p>
                <p className="text-[11px] text-[var(--color-text-3)]">{t.busId}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 text-[11px] font-semibold tabular-nums",
                  overdue ? "text-[var(--color-error)]" : urgent ? "text-amber-400" : "text-[var(--color-text-2)]",
                )}
              >
                {formatMinutesLeft(t.minutesLeft)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
