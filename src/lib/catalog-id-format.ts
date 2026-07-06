/**
 * Formato de identificadores de bus y línea con prefijo de operadora (ej. GF-11018, GL-30).
 * Los IDs nuevos creados al abrir un ticket deben seguir este patrón.
 */

const PREFIXED_ID_RE = /^([A-Za-z]{2,4})-(.+)$/;

export class CatalogIdFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogIdFormatError";
  }
}

export function parsePrefixedCatalogId(id: string): { prefix: string; suffix: string } | null {
  const trimmed = id.trim();
  const match = trimmed.match(PREFIXED_ID_RE);
  if (!match) return null;
  const suffix = match[2].trim();
  if (!suffix) return null;
  return { prefix: match[1].toUpperCase(), suffix };
}

export function normalizePrefixedCatalogId(id: string): string {
  const parsed = parsePrefixedCatalogId(id);
  if (!parsed) return id.trim();
  return `${parsed.prefix}-${parsed.suffix}`;
}

/** Prefijos conocidos (GF, GL, …) extraídos de IDs del catálogo. */
export function collectOperatorPrefixes(catalogIds: string[]): string[] {
  const prefixes = new Set<string>();
  for (const id of catalogIds) {
    const parsed = parsePrefixedCatalogId(id);
    if (parsed) prefixes.add(parsed.prefix);
  }
  return Array.from(prefixes).sort((a, b) => a.localeCompare(b));
}

export function formatPrefixHint(prefixes: string[]): string {
  if (prefixes.length === 0) return "XX-1234";
  return prefixes.map((p) => `${p}-…`).join(", ");
}

export type PrefixedIdValidation =
  | { ok: true; normalized: string }
  | { ok: false; message: string };

export function validatePrefixedCatalogId(
  id: string,
  knownPrefixes: string[],
  kind: "bus" | "línea",
): PrefixedIdValidation {
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, message: `Indica un ${kind} válido.` };
  }

  const parsed = parsePrefixedCatalogId(trimmed);
  if (!parsed) {
    const hint = formatPrefixHint(knownPrefixes);
    return {
      ok: false,
      message:
        kind === "bus"
          ? `El bus nuevo debe llevar prefijo de operadora (ej: ${hint}). No uses solo el número.`
          : `La línea debe llevar prefijo de operadora (ej: ${hint}).`,
    };
  }

  if (knownPrefixes.length > 0 && !knownPrefixes.includes(parsed.prefix)) {
    return {
      ok: false,
      message: `Prefijo «${parsed.prefix}» no reconocido. Usa uno del catálogo: ${knownPrefixes.join(", ")}.`,
    };
  }

  return { ok: true, normalized: `${parsed.prefix}-${parsed.suffix}` };
}

export function isCatalogLineaMatch(linea: string, catalogLineas: string[]): boolean {
  const t = linea.trim().toLowerCase();
  return catalogLineas.some((l) => l.toLowerCase() === t);
}

export function validateOptionalLineaLabel(
  linea: string,
  catalogLineas: string[],
  knownPrefixes: string[],
): PrefixedIdValidation | { ok: true; normalized: string | null } {
  const trimmed = linea.trim();
  if (!trimmed) return { ok: true, normalized: null };
  if (isCatalogLineaMatch(trimmed, catalogLineas)) {
    const exact = catalogLineas.find((l) => l.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
    return { ok: true, normalized: exact };
  }
  return validatePrefixedCatalogId(trimmed, knownPrefixes, "línea");
}
