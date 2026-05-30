/**
 * Configuración de la detección de buses anómalos.
 *
 *   GET  /api/anomalous-config  -> autenticado: devuelve { windowDays, zscore, typeWeights }.
 *   PUT  /api/anomalous-config  -> gestor: actualiza cualquiera de los tres valores.
 *
 * El default historico era 30 días, pero Ibrahim (técnico de campo) pidió
 * bajarlo a 12 para detectar antes los buses problemáticos. Lo dejamos
 * configurable porque cada operadora tiene un patrón de mantenimiento
 * distinto.
 *
 *   - windowDays  : ventana de observación (7..180)
 *   - zscore      : umbral de detección (mean + zscore·stddev), 0.5..5.0
 *   - typeWeights : pesos por tipo de incidencia (más críticas pesan más),
 *                   p.ej. {"Apertura/cierre puertas": 3, "Aire": 0.5}
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  APP_SETTING_KEYS,
  getAppSettingJson,
  getAppSettingNumber,
  setAppSetting,
} from "@/lib/app-settings";
import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { canManageCatalog } from "@/lib/rbac";

export const runtime = "nodejs";

export const ANOMALOUS_DEFAULTS = {
  windowDays: 12,
  zscore: 1.5,
  typeWeights: {} as Record<string, number>,
};

async function readSnapshot() {
  const [windowDays, zscore, typeWeights] = await Promise.all([
    getAppSettingNumber(APP_SETTING_KEYS.ANOMALOUS_WINDOW_DAYS, ANOMALOUS_DEFAULTS.windowDays, {
      min: 7,
      max: 180,
    }),
    getAppSettingNumber(APP_SETTING_KEYS.ANOMALOUS_ZSCORE, ANOMALOUS_DEFAULTS.zscore, {
      min: 0.5,
      max: 5,
    }),
    getAppSettingJson<Record<string, number>>(
      APP_SETTING_KEYS.ANOMALOUS_TYPE_WEIGHTS,
      ANOMALOUS_DEFAULTS.typeWeights,
    ),
  ]);
  return { windowDays, zscore, typeWeights };
}

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  try {
    return NextResponse.json({ config: await readSnapshot() });
  } catch (error) {
    console.error("Error reading anomalous config:", error);
    return NextResponse.json(
      { message: "No se pudo leer la configuración" },
      { status: 500 },
    );
  }
}

const putSchema = z
  .object({
    windowDays: z.number().int().min(7).max(180).optional(),
    zscore: z.number().min(0.5).max(5).optional(),
    typeWeights: z.record(z.string().min(1), z.number().min(0).max(10)).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debes indicar al menos un campo",
  });

export async function PUT(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json(
      { message: "Sin permisos para gestionar esta configuración" },
      { status: 403 },
    );
  }
  try {
    const payload = await request.json().catch(() => null);
    const parsed = putSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    const before = await readSnapshot();

    if (parsed.data.windowDays !== undefined) {
      await setAppSetting(
        APP_SETTING_KEYS.ANOMALOUS_WINDOW_DAYS,
        String(parsed.data.windowDays),
        { name: actor.displayName },
      );
    }
    if (parsed.data.zscore !== undefined) {
      await setAppSetting(
        APP_SETTING_KEYS.ANOMALOUS_ZSCORE,
        String(parsed.data.zscore),
        { name: actor.displayName },
      );
    }
    if (parsed.data.typeWeights !== undefined) {
      await setAppSetting(
        APP_SETTING_KEYS.ANOMALOUS_TYPE_WEIGHTS,
        JSON.stringify(parsed.data.typeWeights),
        { name: actor.displayName },
      );
    }

    const after = await readSnapshot();

    const changes: string[] = [];
    if (before.windowDays !== after.windowDays) {
      changes.push(`ventana ${before.windowDays}→${after.windowDays}d`);
    }
    if (before.zscore !== after.zscore) {
      changes.push(`zscore ${before.zscore}→${after.zscore}`);
    }
    if (JSON.stringify(before.typeWeights) !== JSON.stringify(after.typeWeights)) {
      const keys = Object.keys(after.typeWeights);
      changes.push(`pesos por tipo: ${keys.length} entradas`);
    }
    if (changes.length > 0) {
      await writeAuditEvent({
        userId: actor.userId,
        action: "anomalous.update_config",
        detail: `Detección de buses anómalos actualizada: ${changes.join(", ")}`,
      });
    }

    return NextResponse.json({ config: after });
  } catch (error) {
    console.error("Error updating anomalous config:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo actualizar" },
      { status: 500 },
    );
  }
}
