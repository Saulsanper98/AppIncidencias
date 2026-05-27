/**
 * Acceso al SLA configurable por prioridad.
 *
 * Sustituye al `calculateSlaMinutes()` hardcoded de `src/lib/ticketing.ts`:
 * ahora los tiempos viven en BD (modelo `SlaConfig`) y se pueden editar desde
 * el panel de administración → catálogo.
 *
 * La lectura es muy frecuente (cada creación de ticket) y los valores cambian
 * raramente, así que mantenemos una caché en memoria con TTL corto y un
 * fallback a los valores históricos por si la tabla aún no existe o no hay
 * filas (ej. en arranque tras `prisma migrate deploy` mal aplicado).
 */

import type { TicketPriority } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

/** Valores históricos. Usados como fallback si la BD no responde / no tiene filas. */
export const DEFAULT_SLA_MINUTES: Record<TicketPriority, number> = {
  alta: 30,
  media: 120,
  baja: 240,
};

export type SlaConfigSnapshot = Record<TicketPriority, number>;

type CacheEntry = {
  value: SlaConfigSnapshot;
  expiresAt: number;
};

const CACHE_TTL_MS = 30_000; // 30 segundos: suficiente para no penalizar la hot path.
let cache: CacheEntry | null = null;

function isValidMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 60 * 24 * 7;
}

/**
 * Devuelve el snapshot completo de SLA por prioridad. Si la BD no responde,
 * devuelve los defaults históricos sin crashear el flujo de creación de tickets.
 */
export async function getSlaConfig(force = false): Promise<SlaConfigSnapshot> {
  if (!force && cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  const snapshot: SlaConfigSnapshot = { ...DEFAULT_SLA_MINUTES };
  try {
    const rows = await prisma.slaConfig.findMany({
      select: { priority: true, minutes: true },
    });
    for (const row of rows) {
      if (row.priority === "alta" || row.priority === "media" || row.priority === "baja") {
        if (isValidMinutes(row.minutes)) {
          snapshot[row.priority as TicketPriority] = row.minutes;
        }
      }
    }
  } catch (error) {
    console.warn("[sla-config] Falló lectura, usando defaults:", error);
  }

  cache = {
    value: snapshot,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return snapshot;
}

/** Devuelve los minutos configurados para una prioridad concreta. */
export async function getSlaMinutesForPriority(priority: TicketPriority): Promise<number> {
  const config = await getSlaConfig();
  return config[priority] ?? DEFAULT_SLA_MINUTES[priority];
}

/**
 * Actualiza la configuración de una o varias prioridades. Solo debe llamarse
 * desde rutas con permisos de gestor. Devuelve el snapshot actualizado.
 */
export async function updateSlaConfig(
  updates: Partial<SlaConfigSnapshot>,
  actor: { name?: string | null } = {},
): Promise<SlaConfigSnapshot> {
  const entries = (Object.entries(updates) as Array<[TicketPriority, number]>).filter(
    ([priority, minutes]) =>
      (priority === "alta" || priority === "media" || priority === "baja") && isValidMinutes(minutes),
  );

  if (entries.length === 0) {
    throw new Error("No se ha indicado ninguna prioridad válida para actualizar.");
  }

  const actorName = actor.name ? actor.name.slice(0, 80) : null;

  for (const [priority, minutes] of entries) {
    await prisma.slaConfig.upsert({
      where: { priority },
      create: { priority, minutes, updatedByName: actorName },
      update: { minutes, updatedByName: actorName },
    });
  }

  // Invalida caché para que la próxima lectura tome los nuevos valores.
  cache = null;
  return getSlaConfig(true);
}

/** Invalida la caché manualmente (tests / hot reload). */
export function invalidateSlaConfigCache(): void {
  cache = null;
}
