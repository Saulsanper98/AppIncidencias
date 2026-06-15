import {
  BarChart3,
  ChartNoAxesCombined,
  ClipboardList,
  Handshake,
  LayoutDashboard,
  MessageSquarePlus,
  UserCircle2,
  type LucideIcon,
} from "lucide-react";

import type { UserRole } from "@/lib/domain";

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

export type SectionTabsPresetId = "dashboard" | "tickets" | "account";

const isTechOrManager = (role: UserRole) =>
  role === "tecnico_campo" || role === "gestor_centro_control";

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
 * Pestañas de la sección "Tickets". Tras promover la bandeja a entrada
 * propia del sidebar (junio 2026, vive en /bandeja), aqui quedan las dos
 * vistas que comparten "el equipo del turno":
 *
 *   - Gestion       → /tickets — formulario "Nuevo ticket" + alertas y
 *                     tareas preventivas + auditoria.
 *   - Pase de turno → /handover — repaso del turno (M/T/N) al cerrar.
 *
 * La bandeja ya NO aparece como pestaña: el centro de control la abre
 * con 1 click desde el sidebar.
 */
const ticketsTabs: SectionTab[] = [
  {
    label: "Gestión",
    href: "/tickets",
    icon: ClipboardList,
    // Mantenemos /tickets/[id] aqui tambien por si el usuario navega al
    // detalle desde otras secciones (mapa, busqueda...) — la pestana
    // activa sigue siendo "Gestion" para conservar el contexto visual.
    match: (pathname) =>
      pathname === "/tickets" || pathname.startsWith("/tickets/"),
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
  { label: "Feedback", href: "/feedback", icon: MessageSquarePlus },
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
      return ticketsTabs;
    case "account":
      return accountTabs;
  }
}
