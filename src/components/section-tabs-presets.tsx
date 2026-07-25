import {
  BarChart3,
  BookOpenCheck,
  ChartNoAxesCombined,
  ClipboardList,
  Handshake,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  UserCircle2,
  type LucideIcon,
} from "lucide-react";

import type { UserRole } from "@/lib/domain";
import { canViewOperationalReports } from "@/lib/rbac";

/**
 * Definición de una pestaña interna de sección. Coincide con la del componente
 * `SectionTabs`, pero la centralizamos aquí para evitar un ciclo de imports
 * entre el componente cliente y los presets.
 */
export type SectionTab = {
  label: string;
  href: string;
  icon?: LucideIcon;
  visibleTo?: (role: UserRole) => boolean;
  match?: (pathname: string) => boolean;
};

export type SectionTabsPresetId = "dashboard" | "tickets" | "operacion" | "account" | "conocimiento";

const isTechOrManager = (role: UserRole) => canViewOperationalReports(role);

/**
 * Pestañas de la sección "Dashboard". Englobamos tres pantallas que muestran
 * la misma operación en distintas ventanas temporales / niveles de detalle:
 *  - Operación  → datos en vivo (KPIs del minuto)
 *  - Reportes   → analítica agregada (7-180 días, MTTR, SLA, tops)
 *  - Cuadros    → cuadros de mando configurables por el gestor
 *
 * `Reportes` solo aparece para técnicos y gestores (los conductores no
 * consumen analítica). `Cuadros` se muestra a todos: los conductores acceden
 * en modo solo lectura al "preferred dashboard" del centro.
 */
const dashboardTabs: SectionTab[] = [
  { label: "Operación", href: "/dashboard", icon: ChartNoAxesCombined },
  {
    label: "Reportes",
    href: "/reportes",
    icon: BarChart3,
    visibleTo: isTechOrManager,
  },
  {
    label: "Cuadros",
    href: "/dashboards",
    icon: LayoutDashboard,
    // /dashboards (lista) y /dashboards/[id] (uno concreto) son ambos "Cuadros".
    match: (pathname) => pathname.startsWith("/dashboards"),
  },
];

/**
 * Pestañas de la sección "Tickets" (gestión del turno). La bandeja vive en
 * /bandeja como entrada propia del sidebar, sin pestañas internas.
 *
 *   - Gestión        → /tickets — apunte express + formulario completo (desplegable).
 *   - Pase de turno  → /handover — repaso al cerrar turno.
 */
const ticketsTabs: SectionTab[] = [
  {
    label: "Gestión",
    href: "/tickets",
    icon: ClipboardList,
    match: (pathname) =>
      pathname === "/tickets" ||
      pathname.startsWith("/tickets/"),
  },
  {
    label: "Pase de turno",
    href: "/handover",
    icon: Handshake,
    visibleTo: isTechOrManager,
  },
];

/**
 * Pestañas de la sección "Mi cuenta". El feedback es una acción puntual y muy
 * personal (preferencias, opiniones del propio usuario) — pertenece a su
 * espacio. Disponible para todos los roles.
 */
const accountTabs: SectionTab[] = [
  { label: "Cuenta", href: "/account", icon: UserCircle2 },
];

/**
 * Pestañas de la sección "Conocimiento": referencia permanente (KB),
 * bitácora operativa entre turnos y novedades/avisos.
 */
const conocimientoTabs: SectionTab[] = [
  {
    label: "Base de conocimiento",
    href: "/kb",
    icon: BookOpenCheck,
    match: (pathname) => pathname === "/kb" || pathname.startsWith("/kb/"),
  },
  {
    label: "Bitácora",
    href: "/bitacora",
    icon: NotebookPen,
    match: (pathname) => pathname === "/bitacora" || pathname.startsWith("/bitacora/"),
  },
  { label: "Novedades", href: "/novedades", icon: Megaphone },
];

/**
 * Resuelve el preset por id. Devolver el array funciona desde Client
 * Components — desde Server Components solo se pasa el id (string) a
 * `<SectionTabs preset="..." />` y el componente cliente resuelve aquí.
 */
export function resolveSectionTabsPreset(id: SectionTabsPresetId): SectionTab[] {
  switch (id) {
    case "dashboard":
      return dashboardTabs;
    case "tickets":
    case "operacion":
      return ticketsTabs;
    case "account":
      return accountTabs;
    case "conocimiento":
      return conocimientoTabs;
  }
}
