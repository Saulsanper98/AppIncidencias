import { z } from "zod";

import type { NivelImpacto } from "@/lib/tipologia";

export const updateTicketSchema = z
  .object({
    busId: z.string().trim().min(1).optional(),
    assetId: z.string().trim().optional(),
    tipo: z.string().min(1).optional(),
    subtipo: z.string().min(1).optional(),
    subsubtipo: z.string().min(1).optional(),
    dominio: z.string().min(1).optional(),
    nivelImpacto: z.enum(["Alto", "Medio", "Bajo"] as const satisfies readonly NivelImpacto[]).optional(),
    origenTecnico: z.string().min(1).optional(),
    observaciones: z.string().max(2000).optional(),
    title: z.string().trim().min(3).max(240).optional(),
    description: z.string().trim().min(8).max(8000).optional(),
    lineaLabel: z
      .string()
      .trim()
      .max(120)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    servicioLabel: z
      .string()
      .trim()
      .max(120)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    conductorLabel: z
      .string()
      .trim()
      .max(120)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    /** Motivo obligatorio de la corrección (auditoría). */
    reason: z.string().trim().min(3, "Indica el motivo de la corrección (mín. 3 caracteres)").max(500),
  })
  .refine(
    (data) => {
      const { reason: _reason, ...fields } = data;
      return Object.values(fields).some((v) => v !== undefined);
    },
    { message: "Indica al menos un campo a corregir", path: ["reason"] },
  );

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

const FIELD_LABELS: Record<string, string> = {
  busId: "bus",
  assetId: "activo",
  tipo: "tipo",
  subtipo: "subtipo",
  subsubtipo: "incidencia",
  dominio: "dominio",
  nivelImpacto: "impacto",
  origenTecnico: "origen técnico",
  observaciones: "observaciones",
  title: "título",
  description: "descripción",
  lineaLabel: "línea",
  servicioLabel: "servicio",
  conductorLabel: "conductor",
};

export function summarizeTicketFieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[],
): string {
  const parts: string[] = [];
  for (const key of keys) {
    const prev = before[key];
    const next = after[key];
    if (prev === next) continue;
    const label = FIELD_LABELS[key] ?? key;
    parts.push(`${label}: "${String(prev ?? "—")}" → "${String(next ?? "—")}"`);
  }
  return parts.join("; ");
}
