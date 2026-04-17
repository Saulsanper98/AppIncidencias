import type { UserRole } from "@/lib/domain";

const ROLE_LABEL_ES: Record<UserRole, string> = {
  conductor: "Conductor",
  tecnico_campo: "Técnico de campo",
  gestor_centro_control: "Gestor del centro de control",
};

const ROLE_LABEL_EN: Record<UserRole, string> = {
  conductor: "Driver",
  tecnico_campo: "Field technician",
  gestor_centro_control: "Control center manager",
};

export function userRoleLabel(role: UserRole, locale: "es" | "en"): string {
  return locale === "en" ? ROLE_LABEL_EN[role] : ROLE_LABEL_ES[role];
}
