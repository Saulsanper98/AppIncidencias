/**
 * Detección de buses "anómalos": aquellos con un volumen ponderado de
 * tickets en los últimos N días que excede la media + zscore·stddev de la
 * flota.
 *
 * Pensado para alimentar el banner de atención en Preventivo y widgets del dashboard.
 *
 * Estrategia (sin ML):
 *  1. Lee tickets en la ventana (default 12 d, configurable desde
 *     Admin → Buses anómalos).
 *  2. Cada ticket pesa según su `tipo` (sugerencia Ibrahim): si el gestor
 *     marca p.ej. "Apertura/cierre puertas" con peso 3, ese ticket vale
 *     por 3 al calcular el score del bus. Si un tipo no tiene peso, vale 1.
 *  3. Calcula media y desviación estándar de los scores ponderados.
 *  4. Marca como anómalo todo bus cuyo score >= max(media + zscore·stddev, 3).
 *  5. Devuelve hasta 25 ordenados desc por score, con desglose top-3 tipos.
 *
 * Si llega `?days=N` en la URL, prevalece sobre el setting. Si no, lee el
 * valor configurado por administración (con fallback al default).
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { ANOMALOUS_DEFAULTS } from "@/lib/anomalous-config";
import {
  APP_SETTING_KEYS,
  getAppSettingJson,
  getAppSettingNumber,
} from "@/lib/app-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BusAggregate = {
  busId: string;
  ticketCount: number;
  score: number;
  /** Conteo por tipo (sin peso). Útil para mostrar "top tipo" en el banner. */
  byType: Record<string, number>;
};

function topTypes(byType: Record<string, number>, limit = 3): { tipo: string; count: number }[] {
  return Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([tipo, count]) => ({ tipo, count }));
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json(
        { message: "Debes iniciar sesión", anomalous: [] },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get("days");
    const configuredDays = await getAppSettingNumber(
      APP_SETTING_KEYS.ANOMALOUS_WINDOW_DAYS,
      ANOMALOUS_DEFAULTS.windowDays,
      { min: 7, max: 180 },
    );
    const windowDays = daysParam
      ? Math.min(180, Math.max(7, Number(daysParam) || configuredDays))
      : configuredDays;

    const zscoreThreshold = await getAppSettingNumber(
      APP_SETTING_KEYS.ANOMALOUS_ZSCORE,
      ANOMALOUS_DEFAULTS.zscore,
      { min: 0.5, max: 5 },
    );

    const typeWeights = await getAppSettingJson<Record<string, number>>(
      APP_SETTING_KEYS.ANOMALOUS_TYPE_WEIGHTS,
      ANOMALOUS_DEFAULTS.typeWeights,
    );
    // Normalizar pesos a number sano (defensa contra JSON corrupto).
    const normalizedWeights: Record<string, number> = {};
    for (const [key, raw] of Object.entries(typeWeights ?? {})) {
      const num = Number(raw);
      if (Number.isFinite(num) && num >= 0) normalizedWeights[key] = num;
    }
    const usingWeights = Object.keys(normalizedWeights).length > 0;

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const tickets = await prisma.ticket.findMany({
      where: { createdAt: { gte: since } },
      select: { busId: true, tipo: true },
    });

    if (tickets.length === 0) {
      return NextResponse.json({
        windowDays,
        zscoreThreshold,
        typeWeights: normalizedWeights,
        usingWeights,
        anomalous: [],
        stats: { mean: 0, stddev: 0, threshold: 0 },
      });
    }

    // Agregamos por bus: count, score ponderado y desglose por tipo.
    const byBus = new Map<string, BusAggregate>();
    for (const t of tickets) {
      const weight =
        t.tipo && normalizedWeights[t.tipo] !== undefined ? normalizedWeights[t.tipo] : 1;
      const cur = byBus.get(t.busId) ?? {
        busId: t.busId,
        ticketCount: 0,
        score: 0,
        byType: {},
      };
      cur.ticketCount += 1;
      cur.score += weight;
      if (t.tipo) cur.byType[t.tipo] = (cur.byType[t.tipo] ?? 0) + 1;
      byBus.set(t.busId, cur);
    }

    const aggregates = Array.from(byBus.values());
    const scores = aggregates.map((a) => a.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
    const stddev = Math.sqrt(variance);
    const threshold = Math.max(3, Math.ceil(mean + zscoreThreshold * stddev));

    const anomalous = aggregates
      .filter((a) => a.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);

    const busMeta = await prisma.bus.findMany({
      where: { id: { in: anomalous.map((a) => a.busId) } },
      select: { id: true, operator: true, municipio: true },
    });
    const metaById = new Map(busMeta.map((b) => [b.id, b]));

    return NextResponse.json({
      windowDays,
      zscoreThreshold,
      typeWeights: normalizedWeights,
      usingWeights,
      stats: {
        mean: Math.round(mean * 10) / 10,
        stddev: Math.round(stddev * 10) / 10,
        threshold,
      },
      anomalous: anomalous.map((a) => ({
        busId: a.busId,
        ticketCount: a.ticketCount,
        score: Math.round(a.score * 10) / 10,
        topTypes: topTypes(a.byType, 3),
        operator: metaById.get(a.busId)?.operator ?? null,
        municipio: metaById.get(a.busId)?.municipio ?? null,
        zScore:
          stddev > 0 ? Math.round(((a.score - mean) / stddev) * 10) / 10 : null,
      })),
    });
  } catch (error) {
    console.error("Error en /api/buses/anomalous:", error);
    return NextResponse.json(
      { message: "No se pudo calcular detección de buses anómalos", anomalous: [] },
      { status: 500 },
    );
  }
}
