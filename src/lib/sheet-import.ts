import ExcelJS from "exceljs";

/**
 * Lee la primera hoja de un .xlsx/.xls/.csv a matriz de filas (celdas como string).
 * Reemplazo de `xlsx` (SheetJS) por vulnerabilidades conocidas sin fix en npm.
 */
export async function readFirstSheetRows(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  const looksCsv =
    buffer.length > 0 &&
    !buffer.subarray(0, 2).equals(Buffer.from("PK")) && // zip/xlsx
    !buffer.subarray(0, 8).toString("binary").includes("\xD0\xCF\x11\xE0"); // ole/xls

  try {
    if (looksCsv) {
      const text = buffer.toString("utf8");
      // exceljs csv API espera stream; parseamos CSV simple (coma/; + comillas).
      return parseCsvToRows(text);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  } catch (error) {
    // Fallback CSV si el magic-byte falló
    try {
      return parseCsvToRows(buffer.toString("utf8"));
    } catch {
      throw new Error(
        `No se pudo leer el archivo. Asegúrate de subir un .xlsx o .csv válido. (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("El archivo no contiene ninguna hoja.");
  }

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as Array<string | number | boolean | Date | null | undefined>;
    // ExcelJS usa índice 1-based en row.values[0] === undefined
    const cells: string[] = [];
    const max = Math.max(row.cellCount, values.length - 1);
    for (let i = 1; i <= max; i++) {
      const v = values[i];
      cells.push(cellToString(v));
    }
    if (cells.some((c) => c.trim() !== "")) rows.push(cells);
  });
  return rows;
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "text" in v) {
    return String((v as { text: unknown }).text ?? "");
  }
  if (typeof v === "object" && v !== null && "result" in v) {
    return String((v as { result: unknown }).result ?? "");
  }
  return String(v).trim() === String(v) ? String(v) : String(v);
}

/** CSV mínimo: soporta comillas y separador coma o punto y coma. */
function parseCsvToRows(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "");
  const firstLine = normalized.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === sep) {
      row.push(field.trim());
      field = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      if (ch === "\r") i++;
      row.push(field.trim());
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") {
      row.push(field.trim());
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  if (rows.length === 0) throw new Error("El archivo está vacío.");
  return rows;
}
