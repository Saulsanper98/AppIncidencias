import type { TicketPriority, TicketStatus } from "@/lib/domain";

/** Variante de `Badge` por estado: evita competir el rojo de `error` con SLA crítico y prioridad alta. */
export function ticketStatusBadgeVariant(
  status: TicketStatus,
): "success" | "warning" | "error" | "info" | "neutral" {
  switch (status) {
    case "borrador":
      return "neutral";
    case "abierto":
      return "info";
    case "en_proceso":
      return "warning";
    case "esperando_repuesto":
      return "neutral";
    case "resuelto":
      return "success";
  }
}

/** Clases extra para estados que usan `neutral` pero necesitan acento propio. */
export function ticketStatusBadgeClassName(status: TicketStatus): string | undefined {
  if (status === "borrador") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  }
  if (status === "esperando_repuesto") {
    return "border-violet-400/25 bg-violet-500/10 text-violet-200";
  }
  return undefined;
}

/** Prioridad alta: borde / texto suave, sin el mismo fill que SLA vencido. */
export function priorityBadgeProps(priority: TicketPriority): {
  variant: "success" | "warning" | "error" | "info" | "neutral";
  className?: string;
} {
  if (priority === "alta") {
    return {
      variant: "neutral",
      className:
        "border border-[var(--color-error)]/35 bg-[var(--color-error-light)]/40 text-[var(--color-error)]/95",
    };
  }
  if (priority === "media") {
    return {
      variant: "neutral",
      className:
        "border border-[var(--color-warning)]/35 bg-[var(--color-warning-light)]/50 text-[var(--color-warning)]",
    };
  }
  return { variant: "success" };
}

/**
 * Color del "dot" que precede el texto del estado del ticket. Permite chips
 * más limpios sin depender únicamente del color de fondo del badge, mejora la
 * legibilidad en filas con poca diferencia entre estados.
 */
export function statusDotClass(status: TicketStatus): string {
  switch (status) {
    case "borrador":
      return "bg-amber-300";
    case "abierto":
      return "bg-indigo-300";
    case "en_proceso":
      return "bg-[var(--color-warning)]";
    case "esperando_repuesto":
      return "bg-violet-300";
    case "resuelto":
      return "bg-[var(--color-success)]";
  }
}

/** Clase de fila/card en bandeja según prioridad (borde lateral visible). */
export function bandejaPriorityRowClass(priority: TicketPriority): string {
  if (priority === "alta") return "bandeja-row--alta";
  if (priority === "media") return "bandeja-row--media";
  return "bandeja-row--baja";
}

export function priorityDotClass(priority: TicketPriority): string {
  if (priority === "alta") return "bg-[var(--color-error)]";
  if (priority === "media") return "bg-[var(--color-warning)]";
  return "bg-[var(--color-success)]";
}

/** Clases de texto para SLA en tabla/lista: rojo intenso solo vencido o <10 min; ámbar 10–30 min. */
export function slaMinsRemainingTextClass(mins: number): string {
  if (mins <= 0) return "text-[var(--color-error)]";
  if (mins < 10) return "text-[var(--color-error)] font-medium";
  if (mins < 30) return "text-[var(--color-warning)] font-medium";
  if (mins < 120) return "text-[var(--color-warning)]";
  return "text-[var(--color-text-3)]";
}
