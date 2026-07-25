import type { Asset } from "@prisma/client";

import {
  CatalogIdFormatError,
  collectOperatorPrefixes,
  normalizePrefixedCatalogId,
  type PrefixedIdValidation,
  validatePrefixedCatalogId,
} from "@/lib/catalog-id-format";
import { prisma } from "@/lib/prisma";

export type ResolvedBusAsset = {
  busId: string;
  asset: Asset;
  busWasCreated: boolean;
};

async function loadKnownPrefixes(): Promise<string[]> {
  const [buses, lineas] = await Promise.all([
    prisma.bus.findMany({ select: { id: true } }),
    prisma.linea.findMany({ select: { id: true } }),
  ]);
  return collectOperatorPrefixes([...buses.map((b) => b.id), ...lineas.map((l) => l.id)]);
}

async function inferOperatorForPrefixedBus(busId: string): Promise<string> {
  const parsed = busId.match(/^([A-Z]{2,4})-/);
  if (!parsed) return "Sin asignar";
  const prefix = parsed[1];
  const siblings = await prisma.bus.findMany({
    where: {
      id: { startsWith: `${prefix}-` },
      operator: { not: "Sin asignar" },
    },
    select: { operator: true },
    take: 30,
  });
  if (siblings.length === 0) return "Sin asignar";
  const counts = new Map<string, number>();
  for (const row of siblings) {
    if (!row.operator?.trim()) continue;
    counts.set(row.operator, (counts.get(row.operator) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best?.[0] ?? "Sin asignar";
}

/**
 * Resuelve bus + activo para crear o actualizar tickets.
 * Si el bus no existe en catálogo, lo crea al vuelo con SAE-DEFAULT (prefijo obligatorio).
 */
export async function resolveBusAndAssetForTicket(
  rawBusId: string,
  rawAssetId?: string,
): Promise<ResolvedBusAsset> {
  const trimmed = rawBusId.trim();
  const existingBus = await prisma.bus.findUnique({
    where: { id: trimmed },
    include: { assets: true },
  });

  let busId = trimmed;

  if (!existingBus) {
    const knownPrefixes = await loadKnownPrefixes();
    const validation = validatePrefixedCatalogId(trimmed, knownPrefixes, "bus");
    if (!validation.ok) {
      throw new CatalogIdFormatError(validation.message);
    }
    busId = validation.normalized;
    const operator = await inferOperatorForPrefixedBus(busId);
    const defaultAssetId = `${busId}-SAE-DEFAULT`;
    const created = await prisma.bus.create({
      data: {
        id: busId,
        operator,
        municipio: "Sin asignar",
        lineas: "",
        assets: {
          create: [
            {
              id: defaultAssetId,
              type: "sae",
              serialNumber: `SN-${busId}-01`,
            },
          ],
        },
      },
      include: { assets: true },
    });
    return { busId, asset: created.assets[0]!, busWasCreated: true };
  }

  const assetIdTrimmed = rawAssetId?.trim() ?? "";
  if (assetIdTrimmed) {
    const found = existingBus.assets.find((row) => row.id === assetIdTrimmed);
    if (!found) {
      throw new Error("ASSET_INVALID");
    }
    return { busId, asset: found, busWasCreated: false };
  }

  if (existingBus.assets.length === 0) {
    const defaultAssetId = `${busId}-SAE-DEFAULT`;
    const asset = await prisma.asset.create({
      data: {
        id: defaultAssetId,
        busId,
        type: "sae",
        serialNumber: `SN-${busId}-01`,
      },
    });
    return { busId, asset, busWasCreated: false };
  }

  return { busId, asset: existingBus.assets[0]!, busWasCreated: false };
}

/** Valida y normaliza el bus del formulario (catálogo o nuevo con prefijo). */
export function resolveBusIdForForm(
  rawBusId: string,
  catalogBusIds: string[],
  knownPrefixes: string[],
): PrefixedIdValidation | { ok: true; normalized: string; isNew: boolean } {
  const trimmed = rawBusId.trim();
  if (!trimmed) {
    return { ok: false, message: "Indica un bus válido." };
  }
  const inCatalog = catalogBusIds.some((id) => id === trimmed);
  if (inCatalog) {
    return { ok: true, normalized: trimmed, isNew: false };
  }
  const validation = validatePrefixedCatalogId(trimmed, knownPrefixes, "bus");
  if (!validation.ok) return validation;
  return { ok: true, normalized: validation.normalized, isNew: true };
}

export { normalizePrefixedCatalogId };
