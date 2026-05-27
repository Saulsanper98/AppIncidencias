import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";

export type BusImportRow = {
  /** Fila del Excel/CSV (1-indexada, sin contar la cabecera). */
  rowNumber: number;
  id: string;
  operator: string;
  municipio: string;
  lineas: string[];
};

export type BusImportRowError = {
  rowNumber: number;
  rawId: string | null;
  message: string;
};

export type BusImportParseResult = {
  rows: BusImportRow[];
  errors: BusImportRowError[];
  /** Total de filas con datos detectadas (válidas + inválidas). */
  totalRows: number;
};

export type BusImportCommitResult = {
  created: number;
  skippedExisting: number;
  errors: BusImportRowError[];
};

/** Acepta varios alias para cada columna (case-insensitive, ignora acentos/espacios). */
const COLUMN_ALIASES = {
  id: ["id", "bus", "codigo", "código", "code", "matricula", "matrícula"],
  operator: ["operator", "operadora", "operador", "empresa"],
  municipio: ["municipio", "municipality", "ciudad", "town"],
  lineas: ["lineas", "líneas", "linea", "línea", "lines"],
} as const;

function normalizeHeader(value: string): string {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function findColumn(
  headers: string[],
  field: keyof typeof COLUMN_ALIASES,
): number {
  const aliases = COLUMN_ALIASES[field].map((alias) => normalizeHeader(alias));
  for (let i = 0; i < headers.length; i++) {
    if (aliases.includes(normalizeHeader(headers[i]))) return i;
  }
  return -1;
}

function splitLineas(raw: string): string[] {
  return raw
    .split(/[;,/|]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Parsea un archivo Excel/CSV y devuelve filas validadas + errores por fila.
 * No escribe en base de datos: úsalo como "dry-run".
 */
export function parseBusImportBuffer(buffer: Buffer): BusImportParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (error) {
    throw new Error(
      `No se pudo leer el archivo. Asegúrate de subir un .xlsx, .xls o .csv válido. (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("El archivo no contiene ninguna hoja.");
  }
  const sheet = workbook.Sheets[sheetName];

  // Convertimos a matriz de strings (header:1 mantiene celdas vacías como "").
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rows.length === 0) {
    throw new Error("El archivo está vacío.");
  }

  const headers = rows[0].map((cell) => String(cell ?? "").trim());
  const idIdx = findColumn(headers, "id");
  const operatorIdx = findColumn(headers, "operator");
  const municipioIdx = findColumn(headers, "municipio");
  const lineasIdx = findColumn(headers, "lineas");

  const missing: string[] = [];
  if (idIdx === -1) missing.push("id");
  if (operatorIdx === -1) missing.push("operator");
  if (municipioIdx === -1) missing.push("municipio");
  if (lineasIdx === -1) missing.push("lineas");
  if (missing.length > 0) {
    throw new Error(
      `Faltan columnas obligatorias: ${missing.join(", ")}. Columnas detectadas: ${
        headers.join(", ") || "(ninguna)"
      }.`,
    );
  }

  const validated: BusImportRow[] = [];
  const errors: BusImportRowError[] = [];
  const seenIds = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i; // 1-indexada sin contar cabecera
    const idRaw = String(row[idIdx] ?? "").trim();
    const operatorRaw = String(row[operatorIdx] ?? "").trim();
    const municipioRaw = String(row[municipioIdx] ?? "").trim();
    const lineasRaw = String(row[lineasIdx] ?? "").trim();

    // Saltamos filas totalmente vacías sin contarlas como error.
    if (!idRaw && !operatorRaw && !municipioRaw && !lineasRaw) {
      continue;
    }

    const rowProblems: string[] = [];
    if (idRaw.length < 3) rowProblems.push("id muy corto (mín. 3 caracteres)");
    if (operatorRaw.length < 2) rowProblems.push("operadora vacía");
    if (municipioRaw.length < 2) rowProblems.push("municipio vacío");
    const lineas = splitLineas(lineasRaw);
    if (lineas.length === 0) rowProblems.push("ninguna línea indicada");
    if (idRaw && seenIds.has(idRaw)) {
      rowProblems.push(`id duplicado en este archivo (también en fila ${seenIds.get(idRaw)})`);
    }

    if (rowProblems.length > 0) {
      errors.push({
        rowNumber,
        rawId: idRaw || null,
        message: rowProblems.join("; "),
      });
      continue;
    }

    seenIds.set(idRaw, rowNumber);
    validated.push({
      rowNumber,
      id: idRaw,
      operator: operatorRaw,
      municipio: municipioRaw,
      lineas,
    });
  }

  return { rows: validated, errors, totalRows: validated.length + errors.length };
}

/**
 * Aplica las filas en base de datos. Las que ya existan (mismo id) se saltan.
 * Se procesan en transacción por fila para no abortar todo si una falla.
 */
export async function commitBusImport(rows: BusImportRow[]): Promise<BusImportCommitResult> {
  let created = 0;
  let skippedExisting = 0;
  const errors: BusImportRowError[] = [];

  // Pre-cargamos los IDs que ya existen para no hacer un select por fila.
  const ids = rows.map((row) => row.id);
  const existing = ids.length
    ? await prisma.bus.findMany({
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
      await prisma.bus.create({
        data: {
          id: row.id,
          operator: row.operator,
          municipio: row.municipio,
          lineas: row.lineas.join(","),
          assets: {
            create: [
              {
                id: `${row.id}-SAE-DEFAULT`,
                type: "sae",
                serialNumber: `SN-${row.id}-01`,
              },
            ],
          },
        },
      });
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
