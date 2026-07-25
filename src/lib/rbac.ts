import type { TicketStatus, UserRole } from "@/lib/domain";
import { isTicketOwnedByActor, type TicketOwnershipFields } from "@/lib/ticket-ownership";

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
// Excepción: cuentas isReadOnly de la central (ETRA) pueden cerrar tickets.
export function canUpdateTicketStatus(role: UserRole, isReadOnly = false) {
  if (isReadOnly) return true;
  return role === "tecnico_campo" || role === "gestor_centro_control";
}

/** Añadir notas / comentarios al ticket (mismo perfil que cambio de estado operativo). */
export function canAddTicketComment(role: UserRole, isReadOnly = false) {
  if (isReadOnly) return true;
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

/** Corregir datos del ticket (título, bus, tipología…). Incluye la central ETRA (isReadOnly). */
export function canEditTicket(role: UserRole, isReadOnly = false) {
  if (isReadOnly) return true;
  return role === "tecnico_campo" || role === "gestor_centro_control";
}

/**
 * ¿Puede este actor editar ESTE ticket concreto?
 * Gestores: todos. Técnicos: solo los suyos (asignados o creados por ellos).
 */
export function canEditTicketRecord(
  role: UserRole,
  actorUserId: string,
  ticket: TicketOwnershipFields,
  isReadOnly = false,
) {
  if (!canEditTicket(role, isReadOnly)) return false;
  if (isReadOnly || role === "gestor_centro_control") return true;
  return isTicketOwnedByActor(ticket, actorUserId);
}

/** Los gestores pueden corregir metadatos incluso en tickets ya resueltos. */
export function canEditResolvedTicket(role: UserRole) {
  return role === "gestor_centro_control";
}

/** Corregir metadatos de un ticket resuelto (gestor: todos; técnico: solo propios). */
export function canEditResolvedTicketRecord(
  role: UserRole,
  actorUserId: string,
  ticket: TicketOwnershipFields,
  isReadOnly = false,
) {
  if (isReadOnly) return true;
  if (role === "gestor_centro_control") return true;
  if (role === "tecnico_campo" && isTicketOwnedByActor(ticket, actorUserId)) return true;
  return false;
}

/** Mostrar edición de datos en bandeja o detalle. */
export function canShowTicketEdit(
  role: UserRole,
  status: TicketStatus,
  isReadOnly = false,
  needsCompletion = false,
  actorUserId?: string,
  ticket?: TicketOwnershipFields,
) {
  if (actorUserId && ticket && !canEditTicketRecord(role, actorUserId, ticket, isReadOnly)) {
    return false;
  }
  if (!canEditTicket(role, isReadOnly)) return false;
  if (needsCompletion) return true;
  if (isReadOnly) return true;
  if (status === "borrador") return true;
  if (status === "resuelto") {
    if (actorUserId && ticket) {
      return canEditResolvedTicketRecord(role, actorUserId, ticket, isReadOnly);
    }
    return canEditResolvedTicket(role);
  }
  return true;
}

/** ¿La fila de bandeja debe mostrar el menú ⋮? */
export function ticketHasBandejaActions(
  role: UserRole,
  status: TicketStatus,
  isReadOnly = false,
  needsCompletion = false,
  actorUserId?: string,
  ticket?: TicketOwnershipFields,
) {
  if (needsCompletion || status === "borrador") {
    if (actorUserId && ticket) return canEditTicketRecord(role, actorUserId, ticket, isReadOnly);
    return canEditTicket(role, isReadOnly);
  }
  if (getAllowedTransitions(role, status, isReadOnly).length > 0) return true;
  if (canShowTicketEdit(role, status, isReadOnly, false, actorUserId, ticket)) return true;
  if (!isReadOnly && canAssignTicket(role) && status !== "resuelto") return true;
  if (!isReadOnly && canSoftDeleteTicket(role)) return true;
  if (!isReadOnly && canRequestTicketDeletion(role) && actorUserId && ticket && isTicketOwnedByActor(ticket, actorUserId)) {
    return true;
  }
  return false;
}

/**
 * Subir adjuntos a un ticket existente. Mismas reglas que añadir un
 * comentario: cualquiera con acceso a la operación puede aportar evidencia.
 */
export function canUploadAttachment(role: UserRole, isReadOnly = false) {
  return canAddTicketComment(role, isReadOnly);
}

/**
 * Eliminar un adjunto. Gestores y técnicos de campo (evidencia errónea).
 */
export function canDeleteAttachment(role: UserRole) {
  return role === "gestor_centro_control" || role === "tecnico_campo";
}

/** Crear, editar y eliminar dashboards personalizados. */
export function canManageDashboards(role: UserRole) {
  return role === "gestor_centro_control";
}

/** Crear pases de turno (handover). */
export function canCreateHandover(role: UserRole) {
  return role === "tecnico_campo" || role === "gestor_centro_control";
}

/** Consultar y forzar tareas del scheduler interno. */
export function canUseScheduler(role: UserRole) {
  return role === "gestor_centro_control";
}

export { canCreateGlobalTicketTemplate, canCreateGroupTicketTemplate } from "@/lib/ticket-templates";

/** Borrado directo de tickets (solo gestores). */
export function canSoftDeleteTicket(role: UserRole) {
  return role === "gestor_centro_control";
}

/** Solicitar borrado de un ticket propio (técnicos de campo). */
export function canRequestTicketDeletion(role: UserRole) {
  return role === "tecnico_campo";
}

/** Aprobar o rechazar solicitudes de borrado. */
export function canReviewTicketDeletion(role: UserRole) {
  return role === "gestor_centro_control";
}

/** Editar o eliminar entradas de bitácora ajenas (moderación). */
export function canModerateBitacora(role: UserRole) {
  return role === "gestor_centro_control";
}

/** Reportes analíticos agregados (/reportes). Misma visibilidad que la pestaña UI. */
export function canViewOperationalReports(role: UserRole) {
  return role === "tecnico_campo" || role === "gestor_centro_control";
}

export function canManageCatalog(role: UserRole) {
  return role === "gestor_centro_control";
}

/** Lectura del catálogo de flota: todos los roles autenticados. */
export function canReadCatalog(_role: UserRole) {
  return true;
}

/** Editar ficha de bus (descripción, fotos): todos los roles autenticados. */
export function canEditBusDetail(_role: UserRole) {
  return true;
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

export function getAllowedTransitions(
  role: UserRole,
  current: TicketStatus,
  isReadOnly = false,
): TicketStatus[] {
  // Central ETRA (isReadOnly): solo puede cerrar tickets, no reabrir ni otros estados.
  if (isReadOnly) {
    if (current === "resuelto") return [];
    return ["resuelto"];
  }

  if (role === "conductor") {
    return [];
  }

  if (role === "tecnico_campo") {
    if (current === "borrador") {
      return ["abierto", "resuelto"];
    }
    if (current === "abierto") {
      return ["en_proceso", "esperando_repuesto"];
    }
    if (current === "en_proceso") {
      return ["esperando_repuesto", "resuelto"];
    }
    if (current === "esperando_repuesto") {
      return ["en_proceso"];
    }
    if (current === "resuelto") {
      return ["en_proceso"];
    }
    return [];
  }

  if (current === "resuelto") {
    return ["en_proceso"];
  }

  const allStatuses: TicketStatus[] = ["borrador", "abierto", "en_proceso", "esperando_repuesto", "resuelto"];
  return allStatuses.filter((status) => status !== current);
}
