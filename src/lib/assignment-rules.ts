import type { ShiftKey } from "@/lib/shift-utils";
import { VALID_SHIFTS } from "@/lib/shift-utils";
import { prisma } from "@/lib/prisma";

export type AssignmentRuleRow = {
  id: string;
  active: boolean;
  sortOrder: number;
  operator: string | null;
  lineaMatch: string | null;
  shift: ShiftKey | null;
  userId: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
};

const OPEN_STATUSES = ["abierto", "en_proceso", "esperando_repuesto"] as const;

function normalizeOperator(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t.toUpperCase() : null;
}

function ruleMatches(
  rule: { operator: string | null; lineaMatch: string | null; shift: string | null },
  ctx: { operator: string; lineaLabel: string | null; shift: ShiftKey },
): boolean {
  if (rule.operator) {
    const ro = normalizeOperator(rule.operator);
    const co = normalizeOperator(ctx.operator);
    if (!ro || !co || ro !== co) return false;
  }
  if (rule.lineaMatch) {
    const needle = rule.lineaMatch.trim().toLowerCase();
    const hay = (ctx.lineaLabel ?? "").toLowerCase();
    if (!needle || !hay.includes(needle)) return false;
  }
  if (rule.shift) {
    if (!VALID_SHIFTS.has(rule.shift as ShiftKey)) return false;
    if (rule.shift !== ctx.shift) return false;
  }
  return true;
}

/** Carga operativa: tickets abiertos asignados por técnico. */
export async function getTechnicianOpenLoads(
  excludeUserIds: string[] = [],
): Promise<Map<string, number>> {
  const exclude = new Set(excludeUserIds);
  const grouped = await prisma.ticket.groupBy({
    by: ["assignedToUserId"],
    where: {
      assignedToUserId: { not: null },
      status: { in: [...OPEN_STATUSES] },
    },
    _count: { _all: true },
  });

  const loads = new Map<string, number>();
  for (const row of grouped) {
    const uid = row.assignedToUserId;
    if (!uid || exclude.has(uid)) continue;
    loads.set(uid, row._count._all);
  }

  const technicians = await prisma.user.findMany({
    where: { role: "tecnico_campo", isActive: true },
    select: { id: true },
  });
  for (const tech of technicians) {
    if (exclude.has(tech.id)) continue;
    if (!loads.has(tech.id)) loads.set(tech.id, 0);
  }
  return loads;
}

export function pickLowestLoadTechnician(
  loads: Map<string, number>,
  preferredUserIds?: string[],
): string | null {
  const candidates =
    preferredUserIds && preferredUserIds.length > 0
      ? preferredUserIds.filter((id) => loads.has(id))
      : [...loads.keys()];

  if (candidates.length === 0) return null;

  let bestId: string | null = null;
  let bestLoad = Number.POSITIVE_INFINITY;
  for (const id of candidates) {
    const load = loads.get(id) ?? 0;
    if (load < bestLoad || (load === bestLoad && bestId != null && id < bestId)) {
      bestLoad = load;
      bestId = id;
    }
  }
  return bestId;
}

export async function resolveAssigneeFromRules(ctx: {
  operator: string;
  lineaLabel: string | null;
  shift: ShiftKey;
}): Promise<{ userId: string; ruleId: string | null; reason: string } | null> {
  const rules = await prisma.ticketAssignmentRule.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      user: { select: { id: true, role: true, isActive: true, name: true } },
    },
  });

  const matchingRule = rules.find((r) => ruleMatches(r, ctx));
  const loads = await getTechnicianOpenLoads();

  if (matchingRule) {
    const tech = matchingRule.user;
    if (tech.isActive && tech.role === "tecnico_campo" && loads.has(tech.id)) {
      return {
        userId: tech.id,
        ruleId: matchingRule.id,
        reason: `Regla #${matchingRule.sortOrder + 1} → ${tech.name}`,
      };
    }
  }

  const fallbackId = pickLowestLoadTechnician(loads);
  if (!fallbackId) return null;

  return {
    userId: fallbackId,
    ruleId: matchingRule?.id ?? null,
    reason: matchingRule
      ? `Regla #${matchingRule.sortOrder + 1} (técnico no disponible) → menor carga`
      : "Sin regla coincidente → menor carga",
  };
}

export async function listAssignmentRules(): Promise<AssignmentRuleRow[]> {
  const rows = await prisma.ticketAssignmentRule.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    active: r.active,
    sortOrder: r.sortOrder,
    operator: r.operator,
    lineaMatch: r.lineaMatch,
    shift: r.shift && VALID_SHIFTS.has(r.shift as ShiftKey) ? (r.shift as ShiftKey) : null,
    userId: r.userId,
    userName: r.user.name,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export function parseShiftInput(value: unknown): ShiftKey | null {
  if (value == null || value === "") return null;
  const s = String(value).trim().toUpperCase();
  return VALID_SHIFTS.has(s as ShiftKey) ? (s as ShiftKey) : null;
}
