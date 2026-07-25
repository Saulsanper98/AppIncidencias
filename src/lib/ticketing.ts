import type { AssetType, TicketPriority } from "@/lib/domain";
import type { NivelImpacto } from "@/lib/tipologia";

type PriorityRuleInput = {
  assetType: AssetType;
  impactedLines: number;
  serviceStopped: boolean;
  nivelImpacto?: NivelImpacto;
};

export function calculatePriority(input: PriorityRuleInput): TicketPriority {
  if (input.nivelImpacto === "Alto") {
    return "alta";
  }
  if (input.nivelImpacto === "Medio") {
    return "media";
  }
  if (input.nivelImpacto === "Bajo") {
    return "baja";
  }

  if (input.serviceStopped || input.impactedLines >= 3) {
    return "alta";
  }

  if (input.assetType === "sae" || input.assetType === "router" || input.impactedLines === 2) {
    return "media";
  }

  return "baja";
}

/**
 * Valores históricos hardcoded del SLA por prioridad. Sirven como FALLBACK si
 * la configuración persistida en BD no se ha cargado todavía (preview en el
 * cliente antes del fetch a `/api/sla-config`).
 *
 * Para el cálculo "de verdad" en el servidor, usa `getSlaMinutesForPriority()`
 * de `src/lib/sla-config.ts`.
 */
export const DEFAULT_SLA_MINUTES: Record<TicketPriority, number> = {
  alta: 30,
  media: 120,
  baja: 240,
};

/**
 * Versión sync (fallback) de los minutos por prioridad. Si recibe un snapshot
 * `override`, lo usa; si no, devuelve el default histórico. Útil para preview
 * de UI cuando todavía no se ha hecho el fetch de la configuración real.
 */
export function calculateSlaMinutes(
  priority: TicketPriority,
  override?: Partial<Record<TicketPriority, number>> | null,
): number {
  if (override && typeof override[priority] === "number") {
    return override[priority] as number;
  }
  return DEFAULT_SLA_MINUTES[priority];
}

export function addMinutesIso(baseDate: Date, minutes: number): string {
  return new Date(baseDate.getTime() + minutes * 60_000).toISOString();
}

export function toUiPriority(priority: TicketPriority): "Alta" | "Media" | "Baja" {
  if (priority === "alta") {
    return "Alta";
  }

  if (priority === "media") {
    return "Media";
  }

  return "Baja";
}

/** `minsLate` negativo = minutos desde el vencimiento (hace cuanto vencio). */
export function formatSlaOverdueLabel(minsLate: number): string {
  const m = Math.abs(minsLate);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}
