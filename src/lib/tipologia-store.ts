import type { TipologiaItem } from "@/lib/tipologia";
import { TIPOLOGIA_CSV, tipologiaKey } from "@/lib/tipologia";
import { prisma } from "@/lib/prisma";

type CacheEntry = { value: TipologiaItem[]; expiresAt: number };
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60_000;

function rowToItem(row: {
  tipo: string;
  subtipo: string;
  subsubtipo: string;
  dominio: string;
  nivelImpacto: string;
  origenTecnico: string;
  observaciones: string;
}): TipologiaItem {
  return {
    tipo: row.tipo,
    subtipo: row.subtipo,
    subsubtipo: row.subsubtipo,
    dominio: row.dominio,
    nivelImpacto: row.nivelImpacto as TipologiaItem["nivelImpacto"],
    origenTecnico: row.origenTecnico,
    observaciones: row.observaciones,
  };
}

/** Siembra la tabla desde el CSV histórico si está vacía. */
export async function ensureTipologiaSeeded(): Promise<void> {
  const count = await prisma.tipologiaEntry.count();
  if (count > 0) return;
  await prisma.tipologiaEntry.createMany({
    data: TIPOLOGIA_CSV.map((item, index) => ({
      tipo: item.tipo,
      subtipo: item.subtipo,
      subsubtipo: item.subsubtipo,
      dominio: item.dominio,
      nivelImpacto: item.nivelImpacto,
      origenTecnico: item.origenTecnico,
      observaciones: item.observaciones,
      sortOrder: index,
      active: true,
    })),
  });
}

/** Añade filas del CSV que aún no existen en BD (p. ej. "Generica" tras un seed antiguo). */
async function ensureMissingTipologiasFromCsv(): Promise<void> {
  const existing = await prisma.tipologiaEntry.findMany({
    select: { tipo: true, subtipo: true, subsubtipo: true },
  });
  const existingKeys = new Set(existing.map(tipologiaKey));
  const missing = TIPOLOGIA_CSV.flatMap((item, index) =>
    existingKeys.has(tipologiaKey(item))
      ? []
      : [
          {
            tipo: item.tipo,
            subtipo: item.subtipo,
            subsubtipo: item.subsubtipo,
            dominio: item.dominio,
            nivelImpacto: item.nivelImpacto,
            origenTecnico: item.origenTecnico,
            observaciones: item.observaciones,
            sortOrder: index,
            active: true,
          },
        ],
  );
  if (missing.length === 0) return;
  await prisma.tipologiaEntry.createMany({ data: missing });
}

export async function getTipologias(force = false): Promise<TipologiaItem[]> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.value;
  try {
    await ensureTipologiaSeeded();
    await ensureMissingTipologiasFromCsv();
    const rows = await prisma.tipologiaEntry.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { tipo: "asc" }, { subtipo: "asc" }],
    });
    const items = rows.map(rowToItem);
    cache = { value: items, expiresAt: Date.now() + CACHE_TTL_MS };
    return items;
  } catch (error) {
    console.warn("[tipologia-store] fallback CSV:", error);
    return TIPOLOGIA_CSV;
  }
}

export function invalidateTipologiaCache(): void {
  cache = null;
}
