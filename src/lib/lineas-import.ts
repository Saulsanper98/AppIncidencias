/**
 * Parser + commit para la importación masiva de Líneas (servicios) desde
 * Excel/CSV. Diseñado para acompañar a `catalog-import.ts` (que hace lo mismo
 * para Buses) y compartir patrones de UX en el panel de administración.
 *
 * Diferencias importantes vs. buses:
 *  - El modelo `Linea` solo tiene `id`, así que el parser ignora cualquier
 *    columna que no sea la del código.
 *  - Aceptamos varios alias de cabecera y, si el archivo viene SIN cabecera,
 *    asumimos que toda la primera columna son códigos directos (caso típico
 *    cuando alguien pega de un Excel viejo).
 *  - Igual que en buses, un mismo archivo puede traer más de un código por
 *    celda separados por coma/punto y coma/barra: los partimos siempre.
 */

import { prisma } from "@/lib/prisma";
import { readFirstSheetRows } from "@/lib/sheet-import";

export type LineaImportRow = {
  /** Fila del Excel/CSV (1-indexada, sin contar la cabecera si la hay). */
  rowNumber: number;
  id: string;
};

export type LineaImportRowError = {
  rowNumber: number;
  rawId: string | null;
  message: string;
};

export type LineaImportParseResult = {
  rows: LineaImportRow[];
  errors: LineaImportRowError[];
  /** Total de códigos detectados (válidos + inválidos), no de filas. */
  totalRows: number;
};

export type LineaImportCommitResult = {
  created: number;
  skippedExisting: number;
  errors: LineaImportRowError[];
};

const COLUMN_ALIASES = {
  id: [
    "id",
    "linea",
    "línea",
    "lineas",
    "líneas",
    "codigo",
    "código",
    "code",
    "service",
    "servicio",
    "ruta",
  ],
} as const;

function normalizeHeader(value: string): string {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function findColumn(headers: string[], field: keyof typeof COLUMN_ALIASES): number {
  const aliases = COLUMN_ALIASES[field].map((alias) => normalizeHeader(alias));
  for (let i = 0; i < headers.length; i++) {
    if (aliases.includes(normalizeHeader(headers[i]))) return i;
  }
  return -1;
}

/** Igual que el de buses: acepta separadores comunes en la misma celda. */
function splitIds(raw: string): string[] {
  return raw
    .split(/[;,/|\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Heurística para decidir si la primera fila es una cabecera o ya es un dato.
 * Si tiene una sola columna y la celda contiene un alias conocido → cabecera.
 * Si NO contiene alias conocido, asumimos que ya son datos (formato "una
 * columna de códigos sin cabecera").
 */
function detectHeaderRow(firstRow: unknown[]): boolean {
  if (!firstRow || firstRow.length === 0) return false;
  for (const cell of firstRow) {
    if (typeof cell !== "string" && typeof cell !== "number") continue;
    const norm = normalizeHeader(String(cell));
    if (COLUMN_ALIASES.id.some((alias) => normalizeHeader(alias) === norm)) {
      return true;
    }
  }
  return false;
}

export async function parseLineasImportBuffer(buffer: Buffer): Promise<LineaImportParseResult> {
  let rows: string[][];
  try {
    rows = await readFirstSheetRows(buffer);
  } catch (error) {
    throw new Error(
      `No se pudo leer el archivo. Asegúrate de subir un .xlsx o .csv válido. (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  }

  if (rows.length === 0) {
    throw new Error("El archivo está vacío.");
  }

  const hasHeader = detectHeaderRow(rows[0]);

  let startIdx = 0;
  let idIdx = 0; // por defecto, primera columna

  if (hasHeader) {
    const headers = rows[0].map((cell) => String(cell ?? "").trim());
    const detected = findColumn(headers, "id");
    if (detected !== -1) idIdx = detected;
    startIdx = 1;
  }

  const validated: LineaImportRow[] = [];
  const errors: LineaImportRowError[] = [];
  const seen = new Map<string, number>();

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = hasHeader ? i : i + 1;
    const cell = String(row[idIdx] ?? "").trim();
    if (!cell) continue;

    // Soporta varios códigos en una misma celda separados por ", ; / | \n \t".
    const tokens = splitIds(cell);
    if (tokens.length === 0) continue;

    for (const token of tokens) {
      if (token.length > 64) {
        errors.push({
          rowNumber,
          rawId: token,
          message: "código demasiado largo (máx 64 caracteres)",
        });
        continue;
      }
      if (token.length < 1) continue;

      if (seen.has(token)) {
        errors.push({
          rowNumber,
          rawId: token,
          message: `código duplicado en este archivo (también en fila ${seen.get(token)})`,
        });
        continue;
      }
      seen.set(token, rowNumber);
      validated.push({ rowNumber, id: token });
    }
  }

  if (validated.length === 0 && errors.length === 0) {
    throw new Error("No se encontró ningún código de línea en el archivo.");
  }

  return {
    rows: validated,
    errors,
    totalRows: validated.length + errors.length,
  };
}

export async function commitLineasImport(rows: LineaImportRow[]): Promise<LineaImportCommitResult> {
  let created = 0;
  let skippedExisting = 0;
  const errors: LineaImportRowError[] = [];

  const ids = rows.map((row) => row.id);
  const existing = ids.length
    ? await prisma.linea.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      })
    : [];
  const existingSet = new Set(existing.map((row) => row.id));

  for (const row of rows) {
    if (existingSet.has(row.id)) {
      skippedExisting++;
      continue;
    }
    try {
      await prisma.linea.create({ data: { id: row.id } });
      created++;
    } catch (error) {
      errors.push({
        rowNumber: row.rowNumber,
        rawId: row.id,
        message:
          error instanceof Error
            ? `No se pudo crear: ${error.message}`
            : "No se pudo crear (error desconocido).",
      });
    }
  }

  return { created, skippedExisting, errors };
}
