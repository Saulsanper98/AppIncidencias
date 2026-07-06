import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type DataTableProps = {
  children: ReactNode;
  compact?: boolean;
  className?: string;
  wrapperClassName?: string;
};

/** Wrapper de tabla sobre `.ccmgc-table` (Ola 4 #544). */
export function DataTable({ children, compact = false, className, wrapperClassName }: DataTableProps) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-[var(--color-border)]", wrapperClassName)}>
      <table className={cn("ccmgc-table w-full text-sm", compact && "ccmgc-table--compact", className)}>
        {children}
      </table>
    </div>
  );
}
