import type { TicketPriority, TicketStatus } from "@/lib/domain";

/** Variante de `Badge` por estado: evita competir el rojo de `error` con SLA crítico y prioridad alta. */
export function ticketStatusBadgeVariant(
  status: TicketStatus,
): "success" | "warning" | "error" | "info" | "neutral" {
  switch (status) {
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

/** Clases de texto para SLA en tabla/lista: rojo intenso solo vencido o <10 min; ámbar 10–30 min. */
export function slaMinsRemainingTextClass(mins: number): string {
  if (mins <= 0) return "text-[var(--color-error)]";
  if (mins < 10) return "text-[var(--color-error)] font-medium";
  if (mins < 30) return "text-[var(--color-warning)] font-medium";
  if (mins < 120) return "text-[var(--color-warning)]";
  return "text-[var(--color-text-3)]";
}
