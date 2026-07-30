import { prisma } from "@/lib/prisma";

/** Normaliza ID/código de conductor para unicidad / matching. */
export function normalizeConductorName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

export function displayConductorName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Busca o crea un Conductor a partir de su ID operativo.
 * Hoy el "nombre" del catálogo es el propio ID; más adelante se enlazará al nombre real.
 */
export async function upsertConductorFromLabel(
  label: string | null | undefined,
  operator?: string | null,
): Promise<{ id: string; name: string } | null> {
  const code = displayConductorName(label ?? "");
  if (!code) return null;
  const nameNormalized = normalizeConductorName(code);
  if (!nameNormalized) return null;

  const existing = await prisma.conductor.findUnique({ where: { nameNormalized } });
  if (existing) {
    if (!existing.active) {
      await prisma.conductor.update({
        where: { id: existing.id },
        data: { active: true, ...(operator && !existing.operator ? { operator } : {}) },
      });
    }
    return { id: existing.id, name: existing.name };
  }

  const created = await prisma.conductor.create({
    data: {
      name: code,
      nameNormalized,
      operator: operator?.trim() || null,
    },
  });
  return { id: created.id, name: created.name };
}

export async function listConductorsForTypeahead(q: string, limit = 20) {
  const needle = normalizeConductorName(q);
  const rows = await prisma.conductor.findMany({
    where: {
      active: true,
      ...(needle
        ? {
            OR: [
              { nameNormalized: { contains: needle } },
              { name: { contains: q.trim() } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: limit,
    select: { id: true, name: true, operator: true },
  });
  return rows;
}
