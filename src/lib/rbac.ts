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

/**
 * Subir adjuntos a un ticket existente. Mismas reglas que añadir un
 * comentario: cualquiera con acceso a la operación puede aportar evidencia.
 */
export function canUploadAttachment(role: UserRole) {
  return canAddTicketComment(role);
}

/**
 * Eliminar un adjunto. Solo gestores del centro de control, igual que el
 * borrado lógico de tickets. Los técnicos no borran evidencia.
 */
export function canDeleteAttachment(role: UserRole) {
  return role === "gestor_centro_control" || role === "tecnico_campo";
}

export function canManageCatalog(role: UserRole) {
  return role === "gestor_centro_control";
}

export function canReviewFeedback(role: UserRole) {
  return role === "gestor_centro_control";
}

/** Crear, editar y eliminar artículos de la base de conocimiento. */
export function canManageKnowledge(role: UserRole) {
  return role === "gestor_centro_control" || role === "tecnico_campo";
}

/** Lectura de la KB: todos los roles autenticados. */
export function canReadKnowledge(_role: UserRole) {
  return true;
}

// ─── Novedades / Avisos en vivo ────────────────────────────────────────────
// Publicar avisos (kind=aviso) y novedades de changelog (kind=novedad) queda
// reservado a los gestores del centro de control. Saúl es gestor, así que ya
// entra. Si en el futuro se quisiera restringir solo a una persona concreta,
// se haría aquí comprobando además el email del SessionUser.

/** Publicar/editar/eliminar Announcements (avisos en vivo y novedades). */
export function canPublishAnnouncements(role: UserRole) {
  return role === "gestor_centro_control";
}

/** Leer Announcements: todos los autenticados ven los publicados. */
export function canReadAnnouncements(_role: UserRole) {
  return true;
}

// ─── Desvios ───────────────────────────────────────────────────────────────
// Los conductores ven los desvios (les afectan al recorrido) pero no operan
// sobre ellos. Los tecnicos de campo y gestores si pueden confirmar/cerrar.
// Eliminar y arrancar el poller queda reservado a gestores: son acciones con
// impacto operativo (perdida de trazabilidad / dependencias de email).

/** Ver listado y detalle de desvios. */
export function canReadDesvios(_role: UserRole) {
  return true;
}

/** Crear manual, editar campos en PENDIENTE, confirmar, resolver o cancelar. */
export function canManageDesvios(role: UserRole) {
  return role === "tecnico_campo" || role === "gestor_centro_control";
}

/** Eliminar un desvio (destructivo, deja sin trazabilidad). */
export function canDeleteDesvio(role: UserRole) {
  return role === "gestor_centro_control";
}

/** Arrancar / parar el poller de correo. */
export function canControlDesviosPoller(role: UserRole) {
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
