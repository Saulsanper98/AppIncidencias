import type { TicketPriority } from "@/lib/domain";
import { getGenericTipologia, type TipologiaItem } from "@/lib/tipologia";
import { calculatePriority } from "@/lib/ticketing";

export type ExpressTicketMode = "borrador" | "resuelto";

export type ExpressTipologiaFields = Pick<
  TipologiaItem,
  "tipo" | "subtipo" | "subsubtipo" | "dominio" | "nivelImpacto" | "origenTecnico" | "observaciones"
>;

export function titleFromExpressNote(note: string, maxLen = 80): string {
  const cleaned = note.trim().replace(/\s+/g, " ");
  if (!cleaned) return "Incidencia";
  if (cleaned.length <= maxLen) return cleaned;
  const slice = cleaned.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 20 ? slice.slice(0, lastSpace) : slice).trim() + "…";
}

export function parseIncidentOccurredAt(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildExpressTicketFields(note: string, tipologia?: ExpressTipologiaFields | null) {
  const base = tipologia ?? getGenericTipologia();
  const description = note.trim();
  const title = titleFromExpressNote(description);
  const priority: TicketPriority = calculatePriority({
    assetType: "sae",
    impactedLines: 1,
    serviceStopped: false,
    nivelImpacto: base.nivelImpacto,
  });

  return {
    tipo: base.tipo,
    subtipo: base.subtipo,
    subsubtipo: base.subsubtipo,
    dominio: base.dominio,
    nivelImpacto: base.nivelImpacto,
    origenTecnico: base.origenTecnico,
    observaciones: base.observaciones,
    title,
    description,
    priority,
    impactedLines: 1,
    serviceStopped: false,
  };
}
