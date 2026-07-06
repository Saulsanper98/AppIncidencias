import type { TicketPriority } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

export type EscalationRules = {
  unassignedAgeMinutes: Record<TicketPriority, number>;
  slaWarnMinutes: number;
  staleTicketHours: number;
  autoAssignEnabled: boolean;
  slaReassignEnabled: boolean;
};

export const DEFAULT_ESCALATION_RULES: EscalationRules = {
  unassignedAgeMinutes: { alta: 15, media: 60, baja: 240 },
  slaWarnMinutes: 15,
  staleTicketHours: 48,
  autoAssignEnabled: true,
  slaReassignEnabled: true,
};

type CacheEntry = { value: EscalationRules; expiresAt: number };
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 30_000;

function clampMinutes(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.round(value), 60 * 24 * 14));
}

function clampHours(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.round(value), 24 * 30));
}

export async function getEscalationRules(force = false): Promise<EscalationRules> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.value;

  const rules: EscalationRules = { ...DEFAULT_ESCALATION_RULES, unassignedAgeMinutes: { ...DEFAULT_ESCALATION_RULES.unassignedAgeMinutes } };
  try {
    const row = await prisma.escalationConfig.findUnique({ where: { id: "default" } });
    if (row) {
      rules.unassignedAgeMinutes.alta = clampMinutes(row.unassignedAltaMinutes, rules.unassignedAgeMinutes.alta);
      rules.unassignedAgeMinutes.media = clampMinutes(row.unassignedMediaMinutes, rules.unassignedAgeMinutes.media);
      rules.unassignedAgeMinutes.baja = clampMinutes(row.unassignedBajaMinutes, rules.unassignedAgeMinutes.baja);
      rules.slaWarnMinutes = clampMinutes(row.slaWarnMinutes, rules.slaWarnMinutes);
      rules.staleTicketHours = clampHours(row.staleTicketHours, rules.staleTicketHours);
      rules.autoAssignEnabled = row.autoAssignEnabled;
      rules.slaReassignEnabled = row.slaReassignEnabled;
    }
  } catch (error) {
    console.warn("[escalation-config] fallback a defaults:", error);
  }

  cache = { value: rules, expiresAt: Date.now() + CACHE_TTL_MS };
  return rules;
}

export async function updateEscalationRules(
  patch: Partial<{
    unassignedAltaMinutes: number;
    unassignedMediaMinutes: number;
    unassignedBajaMinutes: number;
    slaWarnMinutes: number;
    staleTicketHours: number;
    autoAssignEnabled: boolean;
    slaReassignEnabled: boolean;
  }>,
  updatedByName: string,
): Promise<EscalationRules> {
  await prisma.escalationConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      unassignedAltaMinutes: clampMinutes(patch.unassignedAltaMinutes, DEFAULT_ESCALATION_RULES.unassignedAgeMinutes.alta),
      unassignedMediaMinutes: clampMinutes(patch.unassignedMediaMinutes, DEFAULT_ESCALATION_RULES.unassignedAgeMinutes.media),
      unassignedBajaMinutes: clampMinutes(patch.unassignedBajaMinutes, DEFAULT_ESCALATION_RULES.unassignedAgeMinutes.baja),
      slaWarnMinutes: clampMinutes(patch.slaWarnMinutes, DEFAULT_ESCALATION_RULES.slaWarnMinutes),
      staleTicketHours: clampHours(patch.staleTicketHours, DEFAULT_ESCALATION_RULES.staleTicketHours),
      autoAssignEnabled: patch.autoAssignEnabled ?? DEFAULT_ESCALATION_RULES.autoAssignEnabled,
      slaReassignEnabled: patch.slaReassignEnabled ?? DEFAULT_ESCALATION_RULES.slaReassignEnabled,
      updatedByName,
    },
    update: {
      ...(patch.unassignedAltaMinutes !== undefined
        ? { unassignedAltaMinutes: clampMinutes(patch.unassignedAltaMinutes, DEFAULT_ESCALATION_RULES.unassignedAgeMinutes.alta) }
        : {}),
      ...(patch.unassignedMediaMinutes !== undefined
        ? { unassignedMediaMinutes: clampMinutes(patch.unassignedMediaMinutes, DEFAULT_ESCALATION_RULES.unassignedAgeMinutes.media) }
        : {}),
      ...(patch.unassignedBajaMinutes !== undefined
        ? { unassignedBajaMinutes: clampMinutes(patch.unassignedBajaMinutes, DEFAULT_ESCALATION_RULES.unassignedAgeMinutes.baja) }
        : {}),
      ...(patch.slaWarnMinutes !== undefined
        ? { slaWarnMinutes: clampMinutes(patch.slaWarnMinutes, DEFAULT_ESCALATION_RULES.slaWarnMinutes) }
        : {}),
      ...(patch.staleTicketHours !== undefined
        ? { staleTicketHours: clampHours(patch.staleTicketHours, DEFAULT_ESCALATION_RULES.staleTicketHours) }
        : {}),
      ...(patch.autoAssignEnabled !== undefined ? { autoAssignEnabled: patch.autoAssignEnabled } : {}),
      ...(patch.slaReassignEnabled !== undefined ? { slaReassignEnabled: patch.slaReassignEnabled } : {}),
      updatedByName,
    },
  });
  cache = null;
  return getEscalationRules(true);
}
