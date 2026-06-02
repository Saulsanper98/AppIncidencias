"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChartNoAxesCombined,
  ClipboardList,
  MapPinned,
  Megaphone,
  Menu,
  MessageSquarePlus,
  Vote,
  Shield,
  UserCircle2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CcmgcLogo } from "@/components/ccmgc-logo";
import { useSseEvent } from "@/hooks/use-sse-event";
import { resolveAccountImageUrl } from "@/lib/account-media";
import type { SessionUser, UserRole } from "@/lib/domain";
import {
  canManageCatalog,
  canManageKnowledge,
  canManageUsers,
  canPublishAnnouncements,
  canReviewFeedback,
} from "@/lib/rbac";
import { cn } from "@/lib/utils";

type MenuBadgeKey = "desvios" | "announcements";

type MenuItem = {
  label: string;
  icon: typeof ChartNoAxesCombined;
  href: string;
  /** Si está definido, se oculta a los roles no incluidos. */
  visibleTo?: (role: UserRole) => boolean;
  /**
   * Si está definido, el sidebar renderiza un badge numérico con el contador
   * correspondiente al lado del icono/label. El valor lo gestiona el sidebar
   * (fetch + SSE) — los items solo declaran qué counter quieren mostrar.
   */
  badge?: MenuBadgeKey;
};

type MenuSection = {
  /** Cabecera mostrada solo en modo expandido. */
  title?: string;
  items: MenuItem[];
};

// Reorganización del menú (mayo 2026): pasamos de 14 a 9 ítems consolidando
// sub-páginas como pestañas internas de su sección padre. Las rutas hijas siguen
// siendo direccionables — solo cambia la nav visual:
//
//   Dashboard       → tabs: Operación · Reportes · Cuadros (`/reportes`, `/dashboards`)
//   Tickets         → tabs: Bandeja · Pase de turno         (`/handover`)
//   Preventivo      → calendario + buses anómalos           (`/preventivo`)
//   Mi cuenta       → tab interna: Cuenta · Feedback        (`/feedback`)
//
// Mayo 2026 (continuación): "Feedback" promovido a ítem PROPIO del sidebar
// dentro de "Mi espacio". Antes solo se accedía como pestaña interna de
// "Mi cuenta", lo que lo escondía. La pestaña interna se mantiene para
// continuidad, pero el ítem directo le da al usuario un atajo de 1 click.
//
// La barra de pestañas la pinta el componente `SectionTabs` en cada página.
// "Inventario" se ocultó del menú (mayo 2026, decisión del centro: no se usa
// de momento). La ruta /inventory sigue accesible por URL si hace falta.
const menuSections: MenuSection[] = [
  {
    title: "Operación",
    items: [
      { label: "Dashboard", icon: ChartNoAxesCombined, href: "/dashboard" },
      { label: "Tickets", icon: ClipboardList, href: "/tickets" },
      // "Desvios" tiene su propio badge: cuenta de PENDIENTE + ACTIVO. Se
      // refresca por SSE en `desvio_nuevo` / `desvio_actualizado` y con un
      // fetch inicial de `/api/desvios/badge`.
      { label: "Desvíos", icon: AlertTriangle, href: "/desvios", badge: "desvios" },
      { label: "Preventivo", icon: CalendarDays, href: "/preventivo" },
      { label: "Mapa", icon: MapPinned, href: "/mapa" },
    ],
  },
  {
    title: "Conocimiento",
    items: [
      { label: "Base de Conocimiento", icon: BookOpenCheck, href: "/kb" },
      // "Novedades" agrupa el changelog público + los avisos en vivo. Tiene
      // badge con el total de items publicados que el usuario aún no ha leído
      // (incluye avisos criticos sin descartar). Se refresca por SSE.
      { label: "Novedades", icon: Megaphone, href: "/novedades", badge: "announcements" },
    ],
  },
  {
    title: "Mi espacio",
    items: [
      { label: "Mi cuenta", icon: UserCircle2, href: "/account" },
      // Feedback como ítem propio para que sea de fácil acceso (1 click
      // desde cualquier página). Antes solo era una pestaña interna de
      // "Mi cuenta", lo que lo escondía.
      { label: "Feedback", icon: MessageSquarePlus, href: "/feedback" },
      // Tablón comunitario de sugerencias votables (Fase 5 del feedback).
      // No reemplaza a Feedback: este se usa para ENVIAR; Sugerencias para
      // VER y PRIORIZAR las propuestas del resto del equipo.
      { label: "Sugerencias", icon: Vote, href: "/sugerencias" },
      {
        label: "Administración",
        icon: Shield,
        href: "/admin",
        visibleTo: (role) =>
          canManageUsers(role) ||
          canManageCatalog(role) ||
          canReviewFeedback(role) ||
          canManageKnowledge(role) ||
          canPublishAnnouncements(role),
      },
    ],
  },
];

const SIDEBAR_STATE_KEY = "ccmgc_sidebar_expanded";

type AppSidebarProps = {
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onExpandedChange?: (expanded: boolean) => void;
};

type ConnectionStatus = "ok" | "slow" | "offline";

export function AppSidebar({ expanded: expandedProp, onToggleExpanded, onExpandedChange }: AppSidebarProps) {
  const [open, setOpen] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(true);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [tooltip, setTooltip] = useState<{ label: string; y: number } | null>(null);
  // LED de conexión al backend para sala de control. ok = <500ms,
  // slow = >500ms, offline = sin respuesta. Se actualiza cada 30s y al
  // recuperar online/offline del navegador.
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("ok");
  const pathname = usePathname();
  const expanded = expandedProp ?? internalExpanded;

  const setExpanded = (value: boolean) => {
    if (expandedProp === undefined) {
      setInternalExpanded(value);
    }
    onExpandedChange?.(value);
  };

  useEffect(() => {
    if (expandedProp !== undefined) return;
    const saved = window.localStorage.getItem(SIDEBAR_STATE_KEY);
    if (saved !== null) {
      setInternalExpanded(saved === "true");
    }
  }, [expandedProp]);

  useEffect(() => {
    if (expandedProp !== undefined) return;
    window.localStorage.setItem(SIDEBAR_STATE_KEY, expanded ? "true" : "false");
  }, [expanded, expandedProp]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { authenticated: boolean; user?: SessionUser };
        if (data.authenticated && data.user) {
          setSessionUser(data.user);
        }
      } catch (error) {
        console.error(error);
      }
    };
    loadSession();
  }, []);

  // Contadores numéricos para los badges del menú (de momento, solo
  // "desvios"). Se inicializa con un GET barato al endpoint y luego se
  // actualiza por SSE (eventos `desvio_nuevo` y `desvio_actualizado`).
  const [badgeCounts, setBadgeCounts] = useState<Record<MenuBadgeKey, number>>({
    desvios: 0,
    announcements: 0,
  });

  const refreshDesviosBadge = useCallback(async () => {
    try {
      const res = await fetch("/api/desvios/badge", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { pendientes?: number; activos?: number };
      const total = Math.max(0, (data.pendientes ?? 0) + (data.activos ?? 0));
      setBadgeCounts((prev) => ({ ...prev, desvios: total }));
    } catch {
      // Si falla, el badge queda en su ultimo valor conocido.
    }
  }, []);

  const refreshAnnouncementsBadge = useCallback(async () => {
    try {
      const res = await fetch("/api/announcements/badge", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { unread?: number };
      setBadgeCounts((prev) => ({ ...prev, announcements: Math.max(0, data.unread ?? 0) }));
    } catch {
      // Mantén el valor anterior si falla.
    }
  }, []);

  useEffect(() => {
    if (!sessionUser) return;
    void refreshDesviosBadge();
    void refreshAnnouncementsBadge();
  }, [sessionUser, refreshDesviosBadge, refreshAnnouncementsBadge]);

  // Refrescos de los badges sobre el stream SSE compartido. El hook
  // `useSseEvent` se conecta al singleton (`sseClient`), por lo que TODOS los
  // componentes del layout comparten una única conexión HTTP al servidor.
  useSseEvent("desvio_nuevo", () => {
    if (sessionUser) void refreshDesviosBadge();
  });
  useSseEvent("desvio_actualizado", () => {
    if (sessionUser) void refreshDesviosBadge();
  });
  useSseEvent("announcement_new", () => {
    if (sessionUser) void refreshAnnouncementsBadge();
  });
  useSseEvent("announcement_updated", () => {
    if (sessionUser) void refreshAnnouncementsBadge();
  });
  useSseEvent("announcement_deleted", () => {
    if (sessionUser) void refreshAnnouncementsBadge();
  });

  // Cuando el usuario entra en /novedades o regresa desde ella, refrescamos
  // por si marcó algo como leído desde la propia página.
  useEffect(() => {
    if (!sessionUser) return;
    if (pathname.startsWith("/novedades")) {
      void refreshAnnouncementsBadge();
    }
  }, [sessionUser, pathname, refreshAnnouncementsBadge]);

  // Listener para refresco instantáneo del badge cuando el propio cliente
  // (panel de Novedades, banner global) marca algo como leído / sin leer.
  // Lo dispara un `window.dispatchEvent(new Event("ccmgc-announcements-changed"))`.
  useEffect(() => {
    if (!sessionUser) return;
    const handler = () => {
      void refreshAnnouncementsBadge();
    };
    window.addEventListener("ccmgc-announcements-changed", handler);
    return () => window.removeEventListener("ccmgc-announcements-changed", handler);
  }, [sessionUser, refreshAnnouncementsBadge]);

  // Monitor de salud de conexión al backend. Ping ligero a /api/auth/session
  // cada 30s; medimos latencia y reportamos un LED (ok / slow / offline).
  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!cancelled) setConnStatus("offline");
        return;
      }
      const started = performance.now();
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const elapsed = performance.now() - started;
        if (cancelled) return;
        if (!res.ok) {
          setConnStatus("slow");
          return;
        }
        setConnStatus(elapsed > 500 ? "slow" : "ok");
      } catch {
        if (!cancelled) setConnStatus("offline");
      }
    };
    ping();
    const id = window.setInterval(ping, 30_000);
    const onOnline = () => ping();
    const onOffline = () => setConnStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const userInitials = useMemo(() => {
    if (!sessionUser?.name) return "SS";
    const parts = sessionUser.name.trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }, [sessionUser?.name]);

  // Normalizamos las URLs heredadas `/uploads/...` -> `/api/account-media/...`
  // para evitar 404s con archivos subidos despues del ultimo rebuild (next
  // start no sirve archivos de public/ creados en runtime).
  const avatarSrc = resolveAccountImageUrl(sessionUser?.avatarUrl);
  const bannerSrc = resolveAccountImageUrl(sessionUser?.bannerUrl);

  const isActive = (href: string) => {
    // El ítem "Dashboard" del sidebar engloba la sub-sección unificada
    // Dashboard / Reportes / Cuadros. Por eso /reportes y /dashboards activan
    // también este item (las tabs internas marcan cuál está activo dentro).
    if (href === "/dashboard") {
      return (
        pathname === "/dashboard" ||
        pathname.startsWith("/reportes") ||
        pathname.startsWith("/dashboards")
      );
    }
    // "Tickets" engloba la bandeja y el "Pase de turno" (/handover).
    if (href === "/tickets") {
      return pathname.startsWith("/tickets") || pathname.startsWith("/handover");
    }
    // "Preventivo" agrupa el calendario preventivo y el banner de buses
    // anómalos. El antiguo /inventory ya no tiene entrada en el menú.
    if (href === "/preventivo") {
      return pathname.startsWith("/preventivo") || pathname.startsWith("/inventory");
    }
    // "Mi cuenta" cubre solo /account. "Feedback" tiene ahora su propio
    // ítem en el sidebar y se activa con pathname.startsWith("/feedback").
    if (href === "/account") {
      return pathname.startsWith("/account");
    }
    if (href === "/feedback") {
      return pathname.startsWith("/feedback");
    }
    if (href === "/admin") return pathname.startsWith("/admin");
    if (href === "/mapa") return pathname.startsWith("/mapa");
    return pathname.startsWith(href) && href !== "#";
  };

  // Filtramos por sección según el rol. Mientras carga la sesión ocultamos
  // los items con `visibleTo` para evitar parpadeos.
  //
  // Caso especial: usuarios `isReadOnly` (p.ej. read@movilidadgc.org) tienen
  // un menú MUY reducido — solo la "Lectura de incidencias" y "Mi cuenta"
  // (para cambio de contraseña / logout). Esto refuerza visualmente que la
  // cuenta es de consulta y evita que el usuario pulse en sitios donde luego
  // no podría editar nada (el backend lo bloquearía igualmente, ver
  // auth-context.ts).
  const visibleSections = useMemo(() => {
    if (sessionUser?.isReadOnly) {
      return [
        {
          title: "Consulta",
          items: [
            { label: "Lectura de incidencias", icon: ClipboardList, href: "/lectura" },
          ],
        },
        {
          title: "Mi espacio",
          items: [{ label: "Mi cuenta", icon: UserCircle2, href: "/account" }],
        },
      ] as MenuSection[];
    }
    return menuSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (!item.visibleTo) return true;
          if (!sessionUser) return false;
          return item.visibleTo(sessionUser.role);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [sessionUser]);

  return (
    <>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed left-4 top-4 z-50 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text-1)] shadow-lg backdrop-blur md:hidden"
      >
        <Menu size={16} />
        Menu
      </button>

      <AnimatePresence>
        {open && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
            aria-label="Cerrar menú"
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full min-h-screen flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full",
          "md:sticky md:translate-x-0",
          expanded ? "overflow-hidden" : "overflow-visible",
          expanded ? "w-60 md:w-60" : "w-60 md:w-16",
        )}
      >
        <div className="flex-shrink-0 px-3 pb-2 pt-4">
          {expanded ? (
            <div className="flex items-center justify-between gap-2">
              {/* Espaciador simétrico al botón de la derecha para que el
                  contenedor del logo quede flanqueado en igual medida y el
                  SVG aterrice en el centro real del sidebar. */}
              <span aria-hidden className="h-6 w-6 flex-shrink-0" />
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="min-w-0 flex-1 rounded-lg p-0.5 outline-none ring-offset-2 ring-offset-[var(--color-surface)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              >
                <CcmgcLogo className="h-11 w-full max-w-[11.5rem]" align="center" />
              </Link>
              <button
                onClick={() => (onToggleExpanded ? onToggleExpanded() : setExpanded(false))}
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[var(--color-text-3)] transition-all duration-150 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
                aria-label="Colapsar sidebar"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-1 py-1">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex w-full justify-center rounded-md p-0.5 outline-none ring-offset-2 ring-offset-[var(--color-surface)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                title="Inicio"
              >
                <CcmgcLogo className="h-8 max-w-[3rem] opacity-90" />
              </Link>
              <button
                onClick={() => (onToggleExpanded ? onToggleExpanded() : setExpanded(true))}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)] transition-all duration-150 hover:bg-[var(--color-accent)]/20"
                aria-label="Expandir sidebar"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <div className="mx-2 mb-2 h-px bg-[var(--color-border)]" />
        </div>

        <nav
          className={cn(
            "flex-1 py-2",
            expanded ? "overflow-y-auto px-2" : "overflow-hidden px-1",
          )}
        >
          {visibleSections.map((section, sectionIdx) => (
            <div key={section.title ?? `section-${sectionIdx}`} className={sectionIdx > 0 ? "mt-4" : undefined}>
              {expanded && section.title ? (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-3)]/60">
                  {section.title}
                </p>
              ) : null}
              {sectionIdx > 0 && !expanded ? (
                <div className="mx-auto mb-1.5 mt-1.5 h-px w-5 bg-[var(--color-border)]/50" aria-hidden />
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map(({ label, icon: Icon, href, badge }) => {
                  const active = isActive(href);
                  const badgeCount = badge ? badgeCounts[badge] : 0;
                  return (
                    <li key={label} className="group relative">
                      {/* Indicador vertical "activo" expandido: barra fina a la
                       *  izquierda. Mucho más premium que pintar fondo entero. */}
                      {expanded && active ? (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--color-accent)]"
                        />
                      ) : null}
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        onMouseEnter={(e) => {
                          if (href === "/mapa") {
                            window.setTimeout(() => {
                              void fetch("/api/map/tickets", { credentials: "include", cache: "no-store" }).catch(() => {});
                            }, 80);
                          }
                          if (expanded) return;
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setTooltip({ label, y: rect.top + rect.height / 2 });
                        }}
                        onMouseLeave={() => {
                          if (expanded) return;
                          setTooltip(null);
                        }}
                        className={cn(
                          "text-sm transition-all duration-150",
                          expanded
                            ? "flex min-h-[36px] items-center gap-3 rounded-lg pl-3.5 pr-3 py-1.5"
                            : "group relative mx-auto mb-0.5 flex h-10 w-10 items-center justify-center rounded-xl",
                          active
                            ? expanded
                              // Estilo "premium" del activo: sin fondo, solo
                              // tipografía bold + texto strong. La barra
                              // lateral marca posición.
                              ? "font-semibold text-[var(--color-text-1)]"
                              : "bg-[var(--color-accent-light)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_30%,transparent)]"
                            : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
                        )}
                      >
                        <span className={cn("relative inline-flex items-center", !expanded && "h-5 w-5 justify-center")}>
                          <Icon
                            size={expanded ? 16 : 18}
                            strokeWidth={1.5}
                            className={cn(
                              active
                                ? "text-[var(--color-accent)]"
                                : "text-[var(--color-text-3)] group-hover:text-[var(--color-text-1)]",
                            )}
                          />
                          {!expanded && badge && badgeCount > 0 ? (
                            <span
                              aria-hidden
                              className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[var(--color-error)] px-1 text-[9px] font-semibold leading-none text-white shadow-[0_0_0_2px_var(--color-surface)]"
                            >
                              {badgeCount > 9 ? "9+" : badgeCount}
                            </span>
                          ) : null}
                        </span>
                        {expanded ? (
                          <>
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                            {badge && badgeCount > 0 ? (
                              <span
                                className={cn(
                                  "inline-flex h-5 min-w-[1.4rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                                  // Cuando esta activo, mantenemos un tono
                                  // discreto sobre el fondo accent-light. Si
                                  // no, usamos rojo para que se vea desde
                                  // lejos en la sala.
                                  active
                                    ? "bg-[var(--color-accent)] text-white"
                                    : "bg-[var(--color-error)] text-white",
                                )}
                              >
                                {badgeCount > 99 ? "99+" : badgeCount}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex-shrink-0 border-t border-[var(--color-border)] px-3 py-3">
          {expanded ? (
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="group relative block overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)]"
              aria-label="Abrir Mi cuenta"
            >
              {/*
               * Banner del usuario como fondo decorativo.
               * Usa overlay degradado para mantener legibilidad del nombre y rol
               * sobre cualquier imagen (incluido GIF).
               */}
              {bannerSrc ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bannerSrc}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-60 transition-opacity duration-200 group-hover:opacity-80"
                    aria-hidden
                  />
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-r from-[var(--color-surface)]/85 via-[var(--color-surface)]/60 to-transparent"
                  />
                </>
              ) : null}
              <div className="relative flex items-center gap-2.5 px-2.5 py-2">
                <div className="relative shrink-0">
                  {avatarSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarSrc}
                      alt={sessionUser?.name ?? ""}
                      className="h-9 w-9 rounded-full object-cover ring-1 ring-[var(--color-border)]"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[11px] font-semibold tracking-wide text-[var(--color-accent)]">
                      {userInitials}
                    </div>
                  )}
                  <ConnectionLed status={connStatus} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-tight text-[var(--color-text-1)]">
                    {sessionUser?.name ?? "Sin sesión"}
                  </p>
                  <p className={cn(
                    "truncate text-[10.5px] uppercase tracking-[0.08em]",
                    sessionUser?.isReadOnly
                      ? "font-semibold text-[var(--color-accent)]"
                      : "text-[var(--color-text-3)]",
                  )}>
                    {sessionUser?.isReadOnly ? "Solo lectura" : humanRole(sessionUser?.role)}
                  </p>
                </div>
              </div>
            </Link>
          ) : (
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="relative flex justify-center"
              aria-label="Abrir Mi cuenta"
              title={`Mi cuenta — ${connectionLabel(connStatus)}`}
            >
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt={sessionUser?.name ?? ""}
                  className="h-9 w-9 rounded-full object-cover ring-1 ring-[var(--color-border)]"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[11px] font-medium text-[var(--color-accent)]">
                  {userInitials}
                </div>
              )}
              <ConnectionLed status={connStatus} />
            </Link>
          )}
        </div>
      </aside>
      {!expanded && tooltip && (
        <div
          className="pointer-events-none fixed left-[72px] z-[9999] -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2.5 py-1.5 text-xs text-[var(--color-text-1)] shadow-lg"
          style={{ top: tooltip.y }}
        >
          {tooltip.label}
        </div>
      )}
    </>
  );
}

/** LED de conexión esquina inferior derecha del avatar. */
function ConnectionLed({ status }: { status: ConnectionStatus }) {
  const color =
    status === "ok"
      ? "bg-[var(--color-success)]"
      : status === "slow"
        ? "bg-[var(--color-warning)]"
        : "bg-[var(--color-error)]";
  return (
    <span
      className={cn(
        "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--color-surface)]",
        color,
      )}
      aria-label={`Conexión: ${connectionLabel(status)}`}
      title={`Conexión: ${connectionLabel(status)}`}
    />
  );
}

function connectionLabel(status: ConnectionStatus): string {
  if (status === "ok") return "estable";
  if (status === "slow") return "lenta";
  return "sin conexión";
}

/** Convierte el role técnico (snake_case) a una etiqueta humana en español. */
function humanRole(role: UserRole | undefined): string {
  if (!role) return "Sin sesión";
  const map: Record<UserRole, string> = {
    gestor_centro_control: "Gestor del centro de control",
    tecnico_campo: "Técnico de campo",
    conductor: "Conductor",
  };
  return map[role] ?? role;
}
