/**
 * Acceso unificado a la configuración clave/valor de la app (`AppSetting`).
 *
 * Cada feature que necesita un parámetro editable desde administración lo
 * persiste aquí usando un `key` con prefijo coherente. El módulo expone
 * helpers tipados para los settings más usados y un getter/setter genérico
 * para nuevos casos.
 *
 * - Lectura cacheada en memoria (TTL corto, 30s) para no penalizar la
 *   hot-path (p. ej. cuando un usuario consulta el banner de buses anómalos
 *   en cada navegación).
 * - Escritura invalida la caché de forma inmediata.
 * - Si la BD no responde, los lectores caen al default declarado en código
 *   y registran un warning — la app NUNCA crashea por un setting.
 */

import { prisma } from "@/lib/prisma";

/** Claves permitidas. Sirve de whitelist en el endpoint admin. */
export const APP_SETTING_KEYS = {
  /** Ventana en días para "buses anómalos" (default 12). */
  ANOMALOUS_WINDOW_DAYS: "anomalous.window_days",
  /** JSON: pesos por tipo de incidencia (default {}; key=tipo, value=peso). */
  ANOMALOUS_TYPE_WEIGHTS: "anomalous.type_weights",
  /** Z-score mínimo para considerar bus anómalo (default 1.5). */
  ANOMALOUS_ZSCORE: "anomalous.zscore",
} as const;

export type AppSettingKey = (typeof APP_SETTING_KEYS)[keyof typeof APP_SETTING_KEYS];

const CACHE_TTL_MS = 30_000;

type CacheEntry = { value: string | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/**
 * Devuelve el valor crudo (string) del setting o `null` si no existe. Usa
 * caché en memoria con TTL corto para evitar golpear BD en cada request.
 */
export async function getAppSettingRaw(key: AppSettingKey): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    const value = row?.value ?? null;
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    console.warn(`[app-settings] lectura falló para '${key}':`, error);
    return null;
  }
}

/**
 * Lee un setting numérico. Si no existe o no es un número válido en el rango
 * (min, max), devuelve `defaultValue`.
 */
export async function getAppSettingNumber(
  key: AppSettingKey,
  defaultValue: number,
  { min, max }: { min?: number; max?: number } = {},
): Promise<number> {
  const raw = await getAppSettingRaw(key);
  if (raw == null) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultValue;
  if (min !== undefined && parsed < min) return defaultValue;
  if (max !== undefined && parsed > max) return defaultValue;
  return parsed;
}

/**
 * Lee un setting JSON. Si no existe o no parsea, devuelve `defaultValue`.
 */
export async function getAppSettingJson<T>(
  key: AppSettingKey,
  defaultValue: T,
): Promise<T> {
  const raw = await getAppSettingRaw(key);
  if (raw == null) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Actualiza un setting. Solo debe llamarse desde rutas con permisos de
 * gestor. Invalida la caché del key correspondiente.
 */
export async function setAppSetting(
  key: AppSettingKey,
  value: string,
  actor: { name?: string | null } = {},
): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value, updatedByName: actor.name ?? null },
    update: { value, updatedByName: actor.name ?? null },
  });
  cache.delete(key);
}

/** Invalida la caché manualmente (tests / hot reload). */
export function invalidateAppSettingsCache(key?: AppSettingKey): void {
  if (key) cache.delete(key);
  else cache.clear();
}
