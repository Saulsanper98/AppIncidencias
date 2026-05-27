import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Clock,
} from "lucide-react";

import type { DesvioEstado } from "@/lib/desvios/types";
import { cn } from "@/lib/utils";

type Props = {
  estado: DesvioEstado;
  size?: "sm" | "md";
  withLabel?: boolean;
  className?: string;
};

const ESTILO: Record<
  DesvioEstado,
  {
    label: string;
    icon: typeof AlertTriangle;
    chip: string;
    icono: string;
  }
> = {
  PENDIENTE: {
    label: "Pendiente",
    icon: AlertTriangle,
    // Amber suave: llama la atencion sin gritar.
    chip:
      "border-[rgba(217,119,6,0.35)] bg-[rgba(217,119,6,0.13)] text-[#d97706]",
    icono: "text-[#d97706]",
  },
  ACTIVO: {
    label: "Activo",
    icon: Clock,
    // Rojo: el desvio esta en curso y los conductores se ven afectados.
    chip: "border-[rgba(220,38,38,0.40)] bg-[rgba(220,38,38,0.14)] text-[#dc2626]",
    icono: "text-[#dc2626]",
  },
  RESUELTO: {
    label: "Resuelto",
    icon: CheckCircle2,
    chip:
      "border-[rgba(5,150,105,0.35)] bg-[rgba(5,150,105,0.12)] text-[#059669]",
    icono: "text-[#059669]",
  },
  CANCELADO: {
    label: "Cancelado",
    icon: CircleSlash,
    chip:
      "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)]",
    icono: "text-[var(--color-text-3)]",
  },
};

export function EstadoBadge({ estado, size = "md", withLabel = true, className }: Props) {
  const { label, icon: Icon, chip, icono } = ESTILO[estado];
  const dim = size === "sm" ? "text-[10.5px] px-1.5 py-0.5 gap-1" : "text-[11.5px] px-2 py-0.5 gap-1.5";
  const iconSize = size === "sm" ? 10 : 12;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.04em]",
        dim,
        chip,
        className,
      )}
      title={label}
    >
      <Icon size={iconSize} strokeWidth={2} className={icono} aria-hidden />
      {withLabel ? label : null}
    </span>
  );
}
