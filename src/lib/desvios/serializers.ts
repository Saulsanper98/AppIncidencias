/**
 * Helpers de (de)serializacion para los campos JSON-string del modelo Desvio.
 *
 * SQLite no soporta `String[]` nativo, asi que guardamos las listas de
 * lineas y paradas como JSON serializado. Estos helpers son la unica via
 * autorizada para leer/escribir esos campos: ningun consumidor (route
 * handler, poller, componente) deberia hacer `JSON.parse` directo.
 */

import type { ParadaDesvio } from "./types";

type LineasField = { lineas_afectadas: string };
type ParadasFueraField = { paradas_fuera: string };
type ParadasAltField = { paradas_alternativas: string };

/** Lista de lineas afectadas. */
export function getLineas(d: LineasField): string[] {
  return parseStringList(d.lineas_afectadas);
}

/** Paradas fuera de servicio (nombre + codigo). */
export function getParadasFuera(d: ParadasFueraField): ParadaDesvio[] {
  return parseParadasList(d.paradas_fuera);
}

/** Paradas alternativas (nombre + codigo). */
export function getParadasAlt(d: ParadasAltField): ParadaDesvio[] {
  return parseParadasList(d.paradas_alternativas);
}

/** Serializa lineas a JSON string para guardar en BD. */
export function serializeLineas(lineas: readonly string[] | null | undefined): string {
  if (!lineas) return "[]";
  const cleaned = lineas
    .map((l) => (typeof l === "string" ? l.trim() : ""))
    .filter((l): l is string => l.length > 0);
  return JSON.stringify(cleaned);
}

/** Serializa paradas a JSON string para guardar en BD. */
export function serializeParadas(paradas: readonly ParadaDesvio[] | null | undefined): string {
  if (!paradas) return "[]";
  const cleaned = paradas
    .map((p) => ({
      nombre: (p.nombre ?? "").trim(),
      codigo: (p.codigo ?? "").trim(),
    }))
    .filter((p) => p.nombre.length > 0 || p.codigo.length > 0);
  return JSON.stringify(cleaned);
}

function parseStringList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x): x is string => x.length > 0);
  } catch {
    return [];
  }
}

function parseParadasList(raw: string | null | undefined): ParadaDesvio[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: ParadaDesvio[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      const nombre = typeof record.nombre === "string" ? record.nombre.trim() : "";
      const codigo = typeof record.codigo === "string" ? record.codigo.trim() : "";
      if (nombre.length === 0 && codigo.length === 0) continue;
      result.push({ nombre, codigo });
    }
    return result;
  } catch {
    return [];
  }
}
