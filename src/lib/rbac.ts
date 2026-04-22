import type { TicketStatus, UserRole } from "@/lib/domain";

const validRoles: UserRole[] = ["conductor", "tecnico_campo", "gestor_centro_control"];

export function parseUserRole(value: string | null): UserRole {
  if (value && validRoles.includes(value as UserRole)) {
    return value as UserRole;
  }
  return "conductor";
}

export function canCreateTicket(role: UserRole) {
  return role === "conductor" || role === "tecnico_campo" || role === "gestor_centro_control";
}

// Los conductores reportan pero no operan: si pudieran cambiar estado
// se arriesga a que cierren tickets antes de que el técnico los valide.
export function canUpdateTicketStatus(role: UserRole) {
  return role === "tecnico_campo" || role === "gestor_centro_control";
}

/** Añadir notas / comentarios al ticket (mismo perfil que cambio de estado operativo). */
export function canAddTicketComment(role: UserRole) {
  return role === "tecnico_campo" || role === "gestor_centro_control";
}

export function canUseFilters(role: UserRole) {
  return role !== "conductor";
}

export function canManageUsers(role: UserRole) {
  return role === "gestor_centro_control";
}

export function canCreatePreventiveTask(role: UserRole) {
  return role === "tecnico_campo" || role === "gestor_centro_control";
}

export function canAssignTicket(role: UserRole) {
  return role === "tecnico_campo" || role === "gestor_centro_control";
}

export function canManageCatalog(role: UserRole) {
  return role === "gestor_centro_control";
}

export function getAllowedTransitions(role: UserRole, current: TicketStatus): TicketStatus[] {
  if (role === "conductor") {
    return [];
  }

  if (role === "tecnico_campo") {
    if (current === "abierto") {
      return ["en_proceso", "esperando_repuesto"];
    }
    if (current === "en_proceso") {
      return ["esperando_repuesto", "resuelto"];
    }
    if (current === "esperando_repuesto") {
      return ["en_proceso"];
    }
    return [];
  }

  if (current === "resuelto") {
    return [];
  }

  const allStatuses: TicketStatus[] = ["abierto", "en_proceso", "esperando_repuesto", "resuelto"];
  return allStatuses.filter((status) => status !== current);
}
