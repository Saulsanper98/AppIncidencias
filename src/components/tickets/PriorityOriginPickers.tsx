"use client";

import { Cpu, UserRound, Waypoints } from "lucide-react";

import type { TicketPriority } from "@/lib/domain";
import { FALLO_ORIGEN_OPTIONS, type FalloOrigen } from "@/lib/fallo-origen";
import { cn } from "@/lib/utils";

const PRIORITY_OPTIONS: {
  value: TicketPriority;
  label: string;
  hint: string;
}[] = [
  { value: "alta", label: "Alta", hint: "Atención inmediata" },
  { value: "media", label: "Media", hint: "En turno" },
  { value: "baja", label: "Baja", hint: "Sin urgencia" },
];

const ORIGEN_ICONS = {
  maquina: Cpu,
  conductor: UserRound,
  externo: Waypoints,
} as const;

type PriorityPickerProps = {
  value: TicketPriority;
  onChange: (value: TicketPriority) => void;
  "aria-label"?: string;
  className?: string;
};

/** Segmented control de prioridad (sustituye `<select>`). */
export function PriorityPicker({
  value,
  onChange,
  "aria-label": ariaLabel = "Prioridad del ticket",
  className,
}: PriorityPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("priority-origin-seg priority-origin-seg--priority", className)}
    >
      {PRIORITY_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={cn(
              "priority-origin-seg__btn",
              `priority-origin-seg__btn--${opt.value}`,
              active && "is-active",
            )}
          >
            <span className="priority-origin-seg__label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type FalloOrigenPickerProps = {
  value: FalloOrigen;
  onChange: (value: FalloOrigen) => void;
  "aria-label"?: string;
  className?: string;
  /** Etiquetas cortas (Express) vs. texto completo (formulario). */
  compact?: boolean;
};

/** Segmented control de origen del fallo (sustituye `<select>`). */
export function FalloOrigenPicker({
  value,
  onChange,
  "aria-label": ariaLabel = "Origen del fallo",
  className,
  compact = false,
}: FalloOrigenPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("priority-origin-seg priority-origin-seg--origen", className)}
    >
      {FALLO_ORIGEN_OPTIONS.map((opt) => {
        const active = value === opt.value;
        const Icon = ORIGEN_ICONS[opt.value];
        const short =
          opt.value === "maquina" ? "Máquina" : opt.value === "conductor" ? "Conductor" : "Externo";
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={cn("priority-origin-seg__btn priority-origin-seg__btn--origen", active && "is-active")}
          >
            <Icon size={13} strokeWidth={1.8} aria-hidden className="shrink-0 opacity-80" />
            <span className="priority-origin-seg__label">{compact ? short : opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
