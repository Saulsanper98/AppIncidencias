import { notifyTicketExternally } from "@/lib/external-notifications";
import { renderTicketEmail, sendUserEmail } from "@/lib/email-notifications";
import { getTechnicianOpenLoads, pickLowestLoadTechnician, resolveAssigneeFromRules } from "@/lib/assignment-rules";
import { getEscalationRules } from "@/lib/escalation-config";
import { prisma } from "@/lib/prisma";
import { currentShiftNow } from "@/lib/shift-utils";
import { publishTicketEvent } from "@/lib/tickets-events";

const AUTO_ASSIGN_STATUSES = ["abierto", "en_proceso", "esperando_repuesto"] as const;

export type AutoAssignResult =
  | { assigned: false; reason: string }
  | {
      assigned: true;
      userId: string;
      userName: string;
      reason: string;
      ruleId: string | null;
    };

async function loadTicketAssignContext(ticketId: string) {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      assignedToUserId: true,
      status: true,
      title: true,
      busId: true,
      priority: true,
      lineaLabel: true,
      bus: { select: { operator: true } },
    },
  });
}

/**
 * Asigna un ticket sin dueño según reglas (operadora, línea, turno) y carga.
 * Idempotente: no reasigna si ya tiene técnico o si ya hubo auto-asignación.
 */
export async function tryAutoAssignTicket(
  ticketId: string,
  options?: { force?: boolean; actorLabel?: string },
): Promise<AutoAssignResult> {
  const escalation = await getEscalationRules();
  if (!escalation.autoAssignEnabled && !options?.force) {
    return { assigned: false, reason: "auto_assign_disabled" };
  }

  const ticket = await loadTicketAssignContext(ticketId);
  if (!ticket) return { assigned: false, reason: "not_found" };
  if (ticket.assignedToUserId && !options?.force) {
    return { assigned: false, reason: "already_assigned" };
  }
  if (!AUTO_ASSIGN_STATUSES.includes(ticket.status as (typeof AUTO_ASSIGN_STATUSES)[number])) {
    return { assigned: false, reason: "status_not_assignable" };
  }

  if (!options?.force) {
    const previous = await prisma.auditEvent.findFirst({
      where: { ticketId, action: "ticket.auto_assigned" },
      select: { id: true },
    });
    if (previous) return { assigned: false, reason: "already_auto_assigned" };
  }

  const pick = await resolveAssigneeFromRules({
    operator: ticket.bus.operator,
    lineaLabel: ticket.lineaLabel,
    shift: currentShiftNow(),
  });
  if (!pick) return { assigned: false, reason: "no_technician_available" };

  const technician = await prisma.user.findUnique({
    where: { id: pick.userId },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!technician?.isActive || technician.role !== "tecnico_campo") {
    return { assigned: false, reason: "technician_invalid" };
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { assignedToUserId: technician.id },
    select: {
      id: true,
      busId: true,
      title: true,
      status: true,
      priority: true,
      assignedToUserId: true,
      assignedTo: { select: { name: true } },
    },
  });

  const actor = options?.actorLabel ?? "Sistema (asignación automática)";
  await prisma.auditEvent.create({
    data: {
      ticketId,
      action: "ticket.auto_assigned",
      detail: `${actor}: ${pick.reason}`,
    },
  });

  notifyTicketExternally({
    kind: "ticket_assigned",
    ticketId: updated.id,
    title: updated.title,
    busId: updated.busId,
    assigneeName: updated.assignedTo?.name ?? null,
  });

  const { subject, html } = renderTicketEmail({
    headline: "Nuevo ticket asignado automáticamente",
    body: `Se te ha asignado un ticket según las reglas de reparto (${pick.reason}).`,
    ticketId: updated.id,
    ticketTitle: updated.title,
    busId: updated.busId,
    status: updated.status,
    priority: updated.priority,
    actor,
  });
  void sendUserEmail({
    userIds: [technician.id],
    subject,
    html,
    dedupeKey: `auto-assign:${updated.id}:${technician.id}`,
  });

  publishTicketEvent("ticket_assigned", {
    id: updated.id,
    busId: updated.busId,
    status: updated.status,
    priority: updated.priority,
    title: updated.title,
    assignedToUserId: updated.assignedToUserId,
    assignedToUserName: updated.assignedTo?.name ?? null,
    by: actor,
  });

  return {
    assigned: true,
    userId: technician.id,
    userName: technician.name,
    reason: pick.reason,
    ruleId: pick.ruleId,
  };
}

/** Reasigna por SLA vencido al técnico con menor carga (excluye el actual). */
export async function reassignTicketForSlaBreach(
  ticketId: string,
  currentAssigneeId: string | null,
): Promise<AutoAssignResult> {
  const escalation = await getEscalationRules();
  if (!escalation.slaReassignEnabled) {
    return { assigned: false, reason: "sla_reassign_disabled" };
  }

  const ticket = await loadTicketAssignContext(ticketId);
  if (!ticket) return { assigned: false, reason: "not_found" };

  const exclude = currentAssigneeId ? [currentAssigneeId] : [];
  const pick = await resolveAssigneeFromRules({
    operator: ticket.bus.operator,
    lineaLabel: ticket.lineaLabel,
    shift: currentShiftNow(),
  });

  let targetId = pick?.userId ?? null;
  if (targetId && currentAssigneeId && targetId === currentAssigneeId) {
    const loads = await getTechnicianOpenLoads(exclude);
    targetId = pickLowestLoadTechnician(loads);
  } else if (!targetId) {
    const loads = await getTechnicianOpenLoads(exclude);
    targetId = pickLowestLoadTechnician(loads);
  }

  if (!targetId) return { assigned: false, reason: "no_alternate_technician" };

  const technician = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!technician?.isActive || technician.role !== "tecnico_campo") {
    return { assigned: false, reason: "technician_invalid" };
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { assignedToUserId: technician.id },
    select: {
      id: true,
      busId: true,
      title: true,
      status: true,
      priority: true,
      assignedToUserId: true,
      assignedTo: { select: { name: true } },
    },
  });

  await prisma.auditEvent.create({
    data: {
      ticketId,
      action: "ticket.sla_reassigned",
      detail: `SLA vencido → reasignado a ${technician.name}`,
    },
  });

  const { subject, html } = renderTicketEmail({
    headline: "Ticket reasignado — SLA vencido",
    body: `El SLA de este ticket ha vencido y se te ha reasignado para atención prioritaria.`,
    ticketId: updated.id,
    ticketTitle: updated.title,
    busId: updated.busId,
    status: updated.status,
    priority: updated.priority,
    actor: "Sistema (SLA)",
  });
  void sendUserEmail({
    userIds: [technician.id],
    subject,
    html,
    dedupeKey: `sla-reassign:${updated.id}:${technician.id}`,
  });

  publishTicketEvent("ticket_assigned", {
    id: updated.id,
    busId: updated.busId,
    status: updated.status,
    priority: updated.priority,
    title: updated.title,
    assignedToUserId: updated.assignedToUserId,
    assignedToUserName: updated.assignedTo?.name ?? null,
    by: "Sistema (SLA)",
  });

  return {
    assigned: true,
    userId: technician.id,
    userName: technician.name,
    reason: "sla_breach_reassign",
    ruleId: pick?.ruleId ?? null,
  };
}
