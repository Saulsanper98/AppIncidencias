/**
 * Calcula si un bus es "anómalo" según la misma lógica que GET /api/buses/anomalous.
 * Devuelve null si el bus no está en la ventana o no supera el umbral.
 */

import { ANOMALOUS_DEFAULTS } from "@/lib/anomalous-config";
import { APP_SETTING_KEYS, getAppSettingJson, getAppSettingNumber } from "@/lib/app-settings";
import { prisma } from "@/lib/prisma";

export type BusAnomalyInfo = {
  busId: string;
  ticketCount: number;
  score: number;
  topTypes: { tipo: string; count: number }[];
  windowDays: number;
  threshold: number;
};

function topTypes(byType: Record<string, number>, limit = 3) {
  return Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([tipo, count]) => ({ tipo, count }));
}

export async function getBusAnomalyInfo(busId: string): Promise<BusAnomalyInfo | null> {
  const windowDays = await getAppSettingNumber(
    APP_SETTING_KEYS.ANOMALOUS_WINDOW_DAYS,
    ANOMALOUS_DEFAULTS.windowDays,
    { min: 7, max: 180 },
  );
  const zscoreThreshold = await getAppSettingNumber(
    APP_SETTING_KEYS.ANOMALOUS_ZSCORE,
    ANOMALOUS_DEFAULTS.zscore,
    { min: 0.5, max: 5 },
  );
  const typeWeights = await getAppSettingJson<Record<string, number>>(
    APP_SETTING_KEYS.ANOMALOUS_TYPE_WEIGHTS,
    ANOMALOUS_DEFAULTS.typeWeights,
  );
  const normalizedWeights: Record<string, number> = {};
  for (const [key, raw] of Object.entries(typeWeights ?? {})) {
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 0) normalizedWeights[key] = num;
  }

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const tickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: since } },
    select: { busId: true, tipo: true },
  });
  if (tickets.length === 0) return null;

  type Agg = { busId: string; ticketCount: number; score: number; byType: Record<string, number> };
  const byBus = new Map<string, Agg>();
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
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);
  const threshold = Math.max(3, Math.ceil(mean + zscoreThreshold * stddev));

  const target = byBus.get(busId);
  if (!target || target.score < threshold) return null;

  return {
    busId: target.busId,
    ticketCount: target.ticketCount,
    score: Math.round(target.score * 10) / 10,
    topTypes: topTypes(target.byType, 3),
    windowDays,
    threshold,
  };
}
