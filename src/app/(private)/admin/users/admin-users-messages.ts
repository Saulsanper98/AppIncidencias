import type { UserRole } from "@/lib/domain";
import { userRoleLabel } from "@/lib/user-role-labels";

export type AdminLocale = "es" | "en";

export function detectAdminLocale(): AdminLocale {
  if (typeof navigator === "undefined") return "es";
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "es";
}

/** Textos UI del módulo administración usuarios (ES/EN). */
export function adminUsersCopy(locale: AdminLocale) {
  const en = locale === "en";
  return {
    title: en ? "User management" : "Gestión de usuarios",
    subtitle: en
      ? "Create accounts, change roles and activation. Changes are recorded in the audit log."
      : "Alta, cambio de rol y activación de cuentas. Los cambios quedan registrados en auditoría.",
    statsTotal: en ? "Total" : "Total",
    statsActive: en ? "Active" : "Activos",
    statsInactive: en ? "Inactive" : "Inactivos",
    statsGestors: en ? "Active control managers" : "Gestores activos",
    statsTipTotal: en ? "All user accounts in the database." : "Todas las cuentas de usuario en la base de datos.",
    statsTipActive: en ? "Users who can sign in." : "Usuarios que pueden iniciar sesión.",
    statsTipInactive: en ? "Deactivated accounts until re-enabled." : "Cuentas desactivadas hasta que se reactiven.",
    statsTipGestors: en ? "Active users with control center manager role." : "Usuarios activos con rol gestor del centro de control.",
    visibleCount: (visible: number, total: number) =>
      en ? `${visible} of ${total} visible` : `${visible} de ${total} visibles`,
    searchPlaceholder: en ? "Search by name, email, role or id…" : "Buscar por nombre, email, rol o id…",
    searchAria: en ? "Search users" : "Buscar usuarios",
    csvExport: (n: number) => (en ? `CSV (${n})` : `CSV (${n})`),
    filterState: en ? "Status" : "Estado",
    filterRole: en ? "Role" : "Rol",
    chipAll: en ? "All" : "Todos",
    chipActive: en ? "Active" : "Activos",
    chipInactive: en ? "Inactive" : "Inactivos",
    clearFilters: en ? "Clear filters" : "Limpiar filtros",
    newUserTitle: en ? "New user" : "Nuevo usuario",
    fieldName: en ? "Full name" : "Nombre completo",
    fieldEmail: en ? "Email" : "Correo electrónico",
    fieldRole: en ? "Role" : "Rol",
    nameMin: en ? "At least 3 characters" : "Mínimo 3 caracteres",
    createCta: en ? "Create user" : "Crear usuario",
    listTitle: en ? "Registered users" : "Usuarios registrados",
    listEmpty: en ? "No registered users" : "Sin usuarios registrados",
    listEmptyHint: en ? "Create the first user using the form" : "Crea el primer usuario con el formulario",
    listFilteredEmptyTitle: en ? "No matches" : "Sin coincidencias",
    listFilteredEmptyHint: en ? "Try other search terms or clear filters." : "Prueba otros términos o limpia los filtros.",
    tableCaption: en ? "Sortable and filterable user list" : "Listado de usuarios del sistema, ordenable y filtrable",
    colUser: en ? "User" : "Usuario",
    colRole: en ? "Role" : "Rol",
    colState: en ? "State" : "Estado",
    colCreated: en ? "Created" : "Alta",
    colUpdated: en ? "Last update" : "Última mod.",
    colActions: en ? "Actions" : "Acciones",
    active: en ? "Active" : "Activo",
    inactive: en ? "Inactive" : "Inactivo",
    deactivate: en ? "Deactivate" : "Desactivar",
    activate: en ? "Activate" : "Activar",
    deactivateSelfTitle: en ? "You cannot deactivate your own account here." : "No puedes desactivar tu propia cuenta aquí",
    dialogDeactivateTitle: en ? "Deactivate account?" : "¿Desactivar cuenta?",
    dialogDeactivateBody: (name: string) =>
      en
        ? `${name} will not be able to sign in until a manager reactivates the account.`
        : `${name} no podrá iniciar sesión hasta que un gestor la reactive.`,
    cancel: en ? "Cancel" : "Cancelar",
    dialogBulkTitle: (n: number) =>
      en ? `Deactivate ${n} accounts?` : `¿Desactivar ${n} cuentas?`,
    dialogBulkBody: en
      ? "Selected users will lose access until reactivated."
      : "Los usuarios seleccionados perderán el acceso hasta que se reactiven.",
    confirmBulk: en ? "Deactivate all" : "Desactivar todos",
    selectedBar: (n: number) => (en ? `${n} selected` : `${n} seleccionados`),
    clearSelection: en ? "Clear selection" : "Limpiar selección",
    selectAllPage: en ? "Select page" : "Seleccionar página",
    pageSize: en ? "Per page" : "Por página",
    pagePrev: en ? "Previous" : "Anterior",
    pageNext: en ? "Next" : "Siguiente",
    pageOf: (p: number, t: number) => (en ? `Page ${p} of ${t}` : `Página ${p} de ${t}`),
    liveFilter: (visible: number, total: number) =>
      en ? `${visible} users shown out of ${total}.` : `${visible} usuarios mostrados de ${total}.`,
    toastSaved: en ? "Changes saved." : "Cambios guardados.",
    toastCreated: en ? "User created." : "Usuario creado.",
    toastReactivated: en ? "Account reactivated." : "Cuenta reactivada.",
    toastRoleUndo: en ? "Undo role" : "Deshacer rol",
    toastRoleUndone: en ? "Role reverted." : "Rol revertido.",
    errorGeneric: en ? "Something went wrong." : "Algo salió mal.",
    errorLoad: en ? "Could not load administration module." : "No se pudo cargar el módulo de administración.",
    errorClose: en ? "Close error message" : "Cerrar mensaje de error",
    roleLabel: (r: UserRole) => userRoleLabel(r, locale),
  };
}

export function flattenZodIssues(issues: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!issues || typeof issues !== "object") return out;
  const f = issues as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
  if (f.fieldErrors) {
    for (const [k, arr] of Object.entries(f.fieldErrors)) {
      if (Array.isArray(arr) && arr[0]) out[k] = arr[0];
    }
  }
  if (f.formErrors?.[0] && !out._form) out._form = f.formErrors[0];
  return out;
}
