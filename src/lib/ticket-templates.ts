import type { UserRole } from "@/lib/domain";

/** Alcance persistido en BD (`global` = compartida con el equipo operativo). */
export type TicketTemplateScope = "personal" | "global";

export function isGroupTicketTemplateScope(scope: string): boolean {
  return scope === "global" || scope === "group";
}

export function ticketTemplateScopeLabel(scope: string): string {
  return isGroupTicketTemplateScope(scope) ? "Del equipo" : "Personal";
}

/** Técnicos y gestores pueden compartir plantillas con el centro de control. */
export function canCreateGroupTicketTemplate(role: UserRole) {
  return role === "tecnico_campo" || role === "gestor_centro_control";
}

/** Alias histórico — misma regla que plantillas de equipo. */
export function canCreateGlobalTicketTemplate(role: UserRole) {
  return canCreateGroupTicketTemplate(role);
}

export function canEditTicketTemplate(
  scope: string,
  ownerId: string | null,
  actorUserId: string,
  actorRole: UserRole,
): boolean {
  if (isGroupTicketTemplateScope(scope)) {
    return ownerId === actorUserId || actorRole === "gestor_centro_control";
  }
  return ownerId === actorUserId;
}
