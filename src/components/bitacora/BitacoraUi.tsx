"use client";

import type { LucideIcon } from "lucide-react";
import { Loader2, Plus } from "lucide-react";

import { SectionTabs } from "@/components/ui/section-tabs";
import { KIND_META, type BitacoraKind } from "@/lib/bitacora-shared";
import { cn } from "@/lib/utils";

import "@/components/bitacora/bitacora.css";

/** Contenedor común de todas las pantallas de bitácora. */
export function BitacoraPageShell({
  children,
  className,
  showSectionTabs = true,
}: {
  children: React.ReactNode;
  className?: string;
  showSectionTabs?: boolean;
}) {
  return (
    <div className={cn("b-log-root mx-auto max-w-6xl space-y-5 pb-14", className)}>
      {showSectionTabs ? (
        <SectionTabs preset="conocimiento" className="b-log-section-tabs" />
      ) : null}
      {children}
    </div>
  );
}

export function BitacoraNewEntryButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="b-log-btn-new">
      <span className="b-log-btn-new__icon" aria-hidden>
        <Plus size={15} strokeWidth={2.5} />
      </span>
      <span>Nueva entrada</span>
    </button>
  );
}

export function BitacoraKindSegment({
  value,
  onChange,
  size = "md",
  className,
}: {
  value: BitacoraKind;
  onChange: (k: BitacoraKind) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn("b-log-kind-segment", size === "sm" && "b-log-kind-segment--sm", className)}
      role="tablist"
      aria-label="Tipo de entrada"
    >
      {(["nota", "alerta", "pendiente"] as BitacoraKind[]).map((k) => {
        const meta = KIND_META[k];
        const Icon = meta.icon;
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(k)}
            className={cn(
              "b-log-kind-segment__btn",
              size === "md" ? "b-log-kind-segment__btn--md" : "b-log-kind-segment__btn--sm",
              active && "is-active",
              k,
            )}
          >
            <Icon size={size === "md" ? 14 : 12} strokeWidth={2} aria-hidden />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

export function BitacoraStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "error" | "warning" | "accent";
}) {
  const toneClass =
    tone === "error"
      ? "text-[var(--color-error)]"
      : tone === "warning"
        ? "text-[var(--color-warning)]"
        : tone === "accent"
          ? "text-[var(--color-accent)]"
          : "text-[var(--color-text-1)]";

  return (
    <div className="b-log-stat">
      <span className={cn("b-log-stat__value", toneClass)}>{value}</span>
      <span className="b-log-stat__label">{label}</span>
    </div>
  );
}

export function BitacoraPinToggle({
  checked,
  onChange,
  id = "bitacora-pin",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="b-log-pin-toggle">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="b-log-pin-toggle__track" aria-hidden />
      <span className="b-log-pin-toggle__label">Fijar arriba del listado</span>
    </label>
  );
}

export function BitacoraInlineSpinner() {
  return <Loader2 size={14} className="animate-spin" aria-hidden />;
}

export function BitacoraMetaChip({
  icon: Icon,
  children,
  tone = "neutral",
  className,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
  tone?: "neutral" | BitacoraKind | "accent" | "mine";
  className?: string;
}) {
  const toneClass =
    tone === "nota" || tone === "alerta" || tone === "pendiente"
      ? KIND_META[tone].chip
      : tone === "accent"
        ? "bg-[var(--color-accent-light)]/70 text-[var(--color-accent)]"
        : tone === "mine"
          ? "bg-[var(--color-accent)]/12 text-[var(--color-accent)]"
          : "bg-[var(--color-surface-2)]/80 text-[var(--color-text-2)]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide",
        toneClass,
        className,
      )}
    >
      {Icon ? <Icon size={10} strokeWidth={2.25} aria-hidden /> : null}
      {children}
    </span>
  );
}
