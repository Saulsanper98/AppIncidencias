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

// Valores acordados con operaciones en reunión de arranque.
// Alta=30min porque corte de servicio; media/baja son estimaciones conservadoras.
// TODO: mover a config cuando haya más rodaje con los tiempos reales.
export function calculateSlaMinutes(priority: TicketPriority): number {
  if (priority === "alta") {
    return 30;
  }

  if (priority === "media") {
    return 120;
  }

  return 240;
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

// TODO: tests unitarios para calculatePriority — los casos edge con
// nivelImpacto=Medio y serviceStopped=true no están cubiertos todavía.
