"use client";

import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
export function FilterLabeledGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5">
      <span className="w-[4.5rem] shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function FilterDivider({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-5 w-px shrink-0 bg-[var(--color-border)]/70", className)}
      aria-hidden
    />
  );
}

export function FilterPills<V extends string>({
  value,
  onChange,
  options,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { v: V; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {options.map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.v}
            type="button"
            onClick={() => onChange(opt.v)}
            aria-pressed={active}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium transition-colors",
              active
                ? "bg-[var(--color-accent)]/12 text-[var(--color-accent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_32%,transparent)]"
                : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function FilterPillToggle({
  pressed,
  onClick,
  accent,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  accent?: "error";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition-colors",
        pressed && accent === "error"
          ? "bg-[var(--color-error-light)] text-[var(--color-error)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-error)_35%,transparent)]"
          : pressed
            ? "bg-[var(--color-accent)]/12 text-[var(--color-accent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_32%,transparent)]"
            : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
      )}
    >
      {children}
    </button>
  );
}

export function FilterSelect({
  Icon,
  label,
  value,
  onChange,
  options,
  inactiveValue = "todos",
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  /** Valor(es) que cuentan como "sin filtrar". */
  inactiveValue?: string | string[];
}) {
  const inactive = Array.isArray(inactiveValue) ? inactiveValue : [inactiveValue];
  const active = !inactive.includes(value);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? label;

  return (
    <div
      className={cn(
        "flex min-w-0 max-w-[13rem] items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors",
        active && "bg-[var(--color-accent)]/6",
      )}
    >
      <Icon
        size={12}
        strokeWidth={2}
        className={cn(
          "shrink-0",
          active ? "text-[var(--color-accent)]" : "text-[var(--color-text-3)]",
        )}
        aria-hidden
      />
      <Select
        size="compact"
        value={value}
        onValueChange={onChange}
        aria-label={label}
        title={`${label}: ${selectedLabel}`}
        panelTitle={label}
        wrapperClassName="min-w-0 flex-1"
        className={cn(active && "!text-[var(--color-accent)]")}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
export function FilterActiveTag({
  label,
  onClear,
  icon,
  title,
}: {
  label: string;
  onClear: () => void;
  icon?: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10.5px] font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/18"
      title={title ?? "Quitar filtro"}
    >
      {icon}
      {label}
      <X size={10} className="opacity-70" aria-hidden />
    </button>
  );
}
