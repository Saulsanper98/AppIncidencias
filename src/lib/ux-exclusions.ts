/**
 * Lista de cuentas que NO deben contar en las métricas UX.
 *
 * Las cuentas propietarias / desarrollo sesgan totalmente los datos:
 * pasan demasiadas horas en la app, abren y cierran flujos para depurar,
 * tocan rutas internas, etc. Por eso descartamos sus eventos tanto en
 * la INGESTA (para no llenar la tabla con ruido) como en las
 * AGREGACIONES (red de seguridad para datos históricos).
 *
 * Si en el futuro necesitas excluir a más usuarios, añade su email aquí
 * (en minúsculas, sin espacios). El cambio se aplica sin migrar nada.
 */

import { prisma } from "@/lib/prisma";

const EXCLUDED_EMAILS = [
  "saul@movilidadgc.org",      // propietario de la app
  "jefedesala@movilidadgc.org", // cuenta de prueba / supervisión, no operativa real
  "etra@etramovilidad.org",       // cuenta central ETRA (vista lectura)
] as const;

/** Caché en memoria del proceso (TTL 60s). Suficiente para SQLite local. */
let cached: { ids: Set<string>; at: number } | null = null;
const TTL_MS = 60_000;

export async function getMetricsExcludedUserIds(): Promise<Set<string>> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.ids;
  try {
    const rows = await prisma.user.findMany({
      where: { email: { in: [...EXCLUDED_EMAILS] } },
      select: { id: true },
    });
    const ids = new Set(rows.map((r) => r.id));
    cached = { ids, at: now };
    return ids;
  } catch {
    // Si la BD falla, devolvemos el cache antiguo o set vacío. Nunca
    // queremos romper el ingest por culpa de la lista de exclusiones.
    return cached?.ids ?? new Set<string>();
  }
}

/**
 * Devuelve un fragmento SQL para usar dentro de un WHERE existente.
 * Ejemplo de uso:
 *   `... WHERE eventName='page_visit' ${await excludedUsersSqlFilter("userId")}`
 *
 * El fragmento se construye con los IDs ya resueltos para no obligar a
 * cada query a hacer un subquery. Si la lista de exclusiones está vacía
 * devuelve cadena vacía (no añade nada al WHERE).
 */
export async function excludedUsersSqlFilter(
  columnRef: string,
): Promise<string> {
  const ids = await getMetricsExcludedUserIds();
  if (ids.size === 0) return "";
  // Los IDs de Prisma (cuid) son seguros para interpolar (alfanuméricos).
  // De todas formas hacemos un sanity-check defensivo: solo letras/dígitos.
  const safe = Array.from(ids).filter((id) => /^[a-z0-9]+$/i.test(id));
  if (safe.length === 0) return "";
  const list = safe.map((id) => `'${id}'`).join(",");
  return `AND (${columnRef} IS NULL OR ${columnRef} NOT IN (${list}))`;
}

/** Para invalidación manual si en algún momento añadimos UI de exclusiones. */
export function invalidateMetricsExclusionsCache(): void {
  cached = null;
}

export const METRICS_EXCLUDED_EMAILS: readonly string[] = EXCLUDED_EMAILS;
