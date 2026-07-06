"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";

import { AnnouncementsBanner } from "@/components/novedades/AnnouncementsBanner";
import { AnnouncementsToastListener } from "@/components/novedades/AnnouncementsToastListener";
import { TicketDraftsBanner } from "@/components/tickets/TicketDraftsBanner";
import { AppSidebar } from "@/components/app-sidebar";
import { ClockChip } from "@/components/clock-chip";
import { DensityToggle } from "@/components/density-toggle";
import { DesvioConfirmReminder } from "@/components/desvios/DesvioConfirmReminder";
import { DesvioNotificationsListener } from "@/components/desvios/DesvioNotificationsListener";
import { FeedbackFAB } from "@/components/feedback/FeedbackFAB";
import { FeedbackModal } from "@/components/feedback/FeedbackModal";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { HeaderUserMenu } from "@/components/header-user-menu";
import { MotionPrefSync } from "@/components/motion-pref-sync";
import { NavigationProgress } from "@/components/navigation-progress";
import { NotificationBell } from "@/components/notification-bell";
import { OfflineQueueIndicator } from "@/components/OfflineQueueIndicator";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";
import { QuickSearch } from "@/components/quick-search";
import { ToastHost } from "@/components/toast-host";
import type { SessionUser } from "@/lib/domain";
import { useTrackPageVisits } from "@/lib/ux-telemetry";
import { ClientErrorBoundary } from "@/components/ux/ClientErrorBoundary";
import type { FeedbackPrefillTarget } from "@/components/feedback/FeedbackForm";
import { cn } from "@/lib/utils";

function MapaMuroUrlSync({ setMapaMuro }: { setMapaMuro: (value: boolean) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const active = pathname.startsWith("/mapa") && searchParams.get("muro") === "1";
    setMapaMuro(active);
  }, [pathname, searchParams, setMapaMuro]);
  return null;
}

function LecturaMuroUrlSync({ setLecturaMuro }: { setLecturaMuro: (value: boolean) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const active = pathname.startsWith("/lectura") && searchParams.get("muro") === "1";
    setLecturaMuro(active);
  }, [pathname, searchParams, setLecturaMuro]);
  return null;
}

export default function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  // Telemetría: cada cambio de path dispara un page_visit con duración.
  // El primer hook abajo se llama incondicionalmente para no romper orden de hooks.
  useTrackPageVisits(pathname);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [ticketCrumbTitle, setTicketCrumbTitle] = useState<string | null>(null);
  const [kbCrumbTitle, setKbCrumbTitle] = useState<string | null>(null);
  const [bitacoraCrumbTitle, setBitacoraCrumbTitle] = useState<string | null>(null);
  const [desvioCrumbTitle, setDesvioCrumbTitle] = useState<string | null>(null);
  const [inventoryControlRoom, setInventoryControlRoom] = useState(false);
  const [mapaMuro, setMapaMuro] = useState(false);
  const [lecturaMuro, setLecturaMuro] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackPrefillTarget | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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

  // Cuentas de SOLO LECTURA: confinarlas a /lectura, /mapa y detalle de tickets.
  // Si entran a cualquier otra URL privada (por bookmark, link compartido o
  // teclear a mano) las mandamos al modo de lectura.
  // /account — perfil y contraseña.
  // /mapa — mapa operativo de incidencias.
  // /tickets/:id — consulta del detalle y corrección de datos técnicos.
  useEffect(() => {
    if (!sessionUser?.isReadOnly) return;
    if (pathname.startsWith("/lectura")) return;
    if (pathname.startsWith("/mapa")) return;
    if (pathname.startsWith("/account")) return;
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] === "tickets" && parts.length === 2 && parts[1]) return;
    router.replace("/lectura");
  }, [sessionUser?.isReadOnly, pathname, router]);

  useEffect(() => {
    const onInvSurface = (e: Event) => {
      const ce = e as CustomEvent<{ active?: boolean }>;
      setInventoryControlRoom(Boolean(ce.detail?.active));
    };
    window.addEventListener("ccmgc-inventory-control-room", onInvSurface as EventListener);
    return () => window.removeEventListener("ccmgc-inventory-control-room", onInvSurface as EventListener);
  }, []);

  useEffect(() => {
    // Evento global "ccmgc-open-feedback": tres modos de uso.
    //  - Con detail { id, label } → modal con target prefijado (modales
    //    contextuales: "Reportar" desde un ticket o un bus).
    //  - Sin detail / detail vacío → modal global del FAB / atajo
    //    Ctrl+Shift+F (sin contexto preestablecido, el usuario decide qué
    //    reportar desde el formulario).
    const onOpenFeedback = (e: Event) => {
      const ce = e as CustomEvent<FeedbackPrefillTarget | undefined>;
      if (ce.detail?.id && ce.detail?.label) {
        setFeedbackTarget({ id: ce.detail.id, label: ce.detail.label });
      } else {
        setFeedbackTarget(null);
      }
      setFeedbackOpen(true);
    };
    window.addEventListener("ccmgc-open-feedback", onOpenFeedback as EventListener);
    return () => window.removeEventListener("ccmgc-open-feedback", onOpenFeedback as EventListener);
  }, []);

  useEffect(() => {
    const readTicketCrumb = () => {
      const ticketPath = pathname.split("/").filter(Boolean);
      if (ticketPath[0] !== "tickets" || ticketPath.length < 2 || !ticketPath[1]) {
        setTicketCrumbTitle(null);
        return;
      }
      const segment = ticketPath[1];
      try {
        const raw = sessionStorage.getItem("ccmgc_ticket_crumb");
        if (!raw) {
          setTicketCrumbTitle(null);
          return;
        }
        const data = JSON.parse(raw) as { id?: string; title?: string };
        if (data.id === segment && typeof data.title === "string") {
          setTicketCrumbTitle(data.title);
        } else {
          setTicketCrumbTitle(null);
        }
      } catch {
        setTicketCrumbTitle(null);
      }
    };
    readTicketCrumb();
    window.addEventListener("ccmgc-ticket-breadcrumb", readTicketCrumb);
    return () => window.removeEventListener("ccmgc-ticket-breadcrumb", readTicketCrumb);
  }, [pathname]);

  useEffect(() => {
    const readKbCrumb = () => {
      const segments = pathname.split("/").filter(Boolean);
      if (segments[0] !== "kb" || segments.length < 2 || !segments[1]) {
        setKbCrumbTitle(null);
        return;
      }
      const slug = segments[1];
      try {
        const raw = sessionStorage.getItem("ccmgc_kb_crumb");
        if (!raw) {
          setKbCrumbTitle(null);
          return;
        }
        const data = JSON.parse(raw) as { slug?: string; title?: string };
        if (data.slug === slug && typeof data.title === "string") {
          setKbCrumbTitle(data.title);
        } else {
          setKbCrumbTitle(null);
        }
      } catch {
        setKbCrumbTitle(null);
      }
    };
    readKbCrumb();
    window.addEventListener("ccmgc-kb-breadcrumb", readKbCrumb);
    return () => window.removeEventListener("ccmgc-kb-breadcrumb", readKbCrumb);
  }, [pathname]);

  useEffect(() => {
    const readBitacoraCrumb = () => {
      const segments = pathname.split("/").filter(Boolean);
      if (segments[0] !== "bitacora" || segments.length < 2 || !segments[1] || segments[1] === "nueva") {
        setBitacoraCrumbTitle(null);
        return;
      }
      const id = segments[1];
      try {
        const raw = sessionStorage.getItem("ccmgc_bitacora_crumb");
        if (!raw) {
          setBitacoraCrumbTitle(null);
          return;
        }
        const data = JSON.parse(raw) as { id?: string; title?: string };
        if (data.id === id && typeof data.title === "string") {
          setBitacoraCrumbTitle(data.title);
        } else {
          setBitacoraCrumbTitle(null);
        }
      } catch {
        setBitacoraCrumbTitle(null);
      }
    };
    readBitacoraCrumb();
    window.addEventListener("ccmgc-bitacora-breadcrumb", readBitacoraCrumb);
    return () => window.removeEventListener("ccmgc-bitacora-breadcrumb", readBitacoraCrumb);
  }, [pathname]);

  useEffect(() => {
    const readDesvioCrumb = () => {
      const segments = pathname.split("/").filter(Boolean);
      if (segments[0] !== "desvios" || segments.length < 2 || !segments[1] || segments[1] === "nuevo") {
        setDesvioCrumbTitle(null);
        return;
      }
      const id = segments[1];
      try {
        const raw = sessionStorage.getItem("ccmgc_desvio_crumb");
        if (!raw) {
          setDesvioCrumbTitle(null);
          return;
        }
        const data = JSON.parse(raw) as { id?: string; title?: string };
        if (data.id === id && typeof data.title === "string") {
          setDesvioCrumbTitle(data.title);
        } else {
          setDesvioCrumbTitle(null);
        }
      } catch {
        setDesvioCrumbTitle(null);
      }
    };
    readDesvioCrumb();
    window.addEventListener("ccmgc-desvio-breadcrumb", readDesvioCrumb);
    return () => window.removeEventListener("ccmgc-desvio-breadcrumb", readDesvioCrumb);
  }, [pathname]);

  type Crumb = { label: string; href?: string };

  const breadcrumbs = useMemo((): Crumb[] => {
    const root: Crumb = { label: "CCMGC", href: "/dashboard" };
    if (pathname.startsWith("/admin/users")) {
      return [root, { label: "Administración", href: "/admin" }, { label: "Usuarios" }];
    }
    if (pathname.startsWith("/admin/catalog")) {
      return [root, { label: "Administración", href: "/admin" }, { label: "Catálogo" }];
    }
    if (pathname.startsWith("/admin/feedback")) {
      return [root, { label: "Administración", href: "/admin" }, { label: "Feedback" }];
    }
    if (pathname.startsWith("/admin/kb")) {
      return [root, { label: "Administración", href: "/admin" }, { label: "KB" }];
    }
    if (pathname === "/admin") {
      return [root, { label: "Administración", href: "/admin" }];
    }
    if (pathname.startsWith("/feedback")) {
      return [root, { label: "Feedback" }];
    }
    if (pathname.startsWith("/dashboards")) {
      return [root, { label: "Dashboards", href: "/dashboards" }];
    }
    const ticketPath = pathname.split("/").filter(Boolean);
    if (ticketPath[0] === "tickets" && ticketPath.length >= 2 && ticketPath[1]) {
      const segment = ticketPath[1];
      const short = segment.length >= 8 ? segment.slice(-8).toUpperCase() : segment;
      const title = ticketCrumbTitle?.trim();
      const truncated =
        title && title.length > 42 ? `${title.slice(0, 40).trimEnd()}…` : title;
      const label = truncated ? `${short} · ${truncated}` : `Ticket ${short}`;
      const parent = sessionUser?.isReadOnly
        ? { label: "Lectura de incidencias", href: "/lectura" }
        : { label: "Bandeja", href: "/bandeja" };
      return [root, parent, { label }];
    }
    if (pathname === "/bandeja") {
      return [];
    }
    if (pathname.startsWith("/bandeja")) {
      return [root, { label: "Bandeja", href: "/bandeja" }];
    }
    if (pathname === "/tickets/express") {
      return [root, { label: "Tickets", href: "/tickets" }, { label: "Apunte express" }];
    }
    if (pathname.startsWith("/tickets")) {
      return [root, { label: "Tickets", href: "/tickets" }];
    }
    if (pathname.startsWith("/dashboard")) {
      return [root, { label: "Dashboard", href: "/dashboard" }];
    }
    if (pathname.startsWith("/inventory")) {
      return [root, { label: "Inventario", href: "/inventory" }];
    }
    if (pathname.startsWith("/mapa")) {
      return [root, { label: "Mapa", href: "/mapa" }];
    }
    if (pathname.startsWith("/reportes")) {
      return [root, { label: "Dashboard", href: "/dashboard" }, { label: "Reportes" }];
    }
    if (pathname.startsWith("/desvios/nuevo")) {
      return [root, { label: "Desvíos", href: "/desvios" }, { label: "Nuevo" }];
    }
    if (pathname.startsWith("/desvios/")) {
      const title = desvioCrumbTitle?.trim();
      const truncated =
        title && title.length > 42 ? `${title.slice(0, 40).trimEnd()}…` : title;
      return [root, { label: "Desvíos", href: "/desvios" }, { label: truncated ?? "Detalle" }];
    }
    if (pathname.startsWith("/desvios")) {
      return [root, { label: "Desvíos", href: "/desvios" }];
    }
    if (pathname.startsWith("/preventivo")) {
      return [root, { label: "Preventivo", href: "/preventivo" }];
    }
    const flotaPath = pathname.split("/").filter(Boolean);
    if (flotaPath[0] === "flota" && flotaPath.length >= 2 && flotaPath[1]) {
      return [root, { label: "Flota", href: "/flota" }, { label: decodeURIComponent(flotaPath[1]) }];
    }
    if (pathname.startsWith("/flota")) {
      return [root, { label: "Flota", href: "/flota" }];
    }
    if (pathname.startsWith("/catalog")) {
      return [root, { label: "Flota", href: "/flota" }];
    }
    if (pathname.startsWith("/handover")) {
      return [root, { label: "Tickets", href: "/tickets" }, { label: "Pase de turno" }];
    }
    if (pathname.startsWith("/novedades")) {
      return [root, { label: "Novedades", href: "/novedades" }];
    }
    if (pathname.startsWith("/sugerencias")) {
      return [root, { label: "Sugerencias", href: "/sugerencias" }];
    }
    const kbPath = pathname.split("/").filter(Boolean);
    if (kbPath[0] === "kb" && kbPath.length >= 2 && kbPath[1]) {
      const title = kbCrumbTitle?.trim();
      const truncated =
        title && title.length > 42 ? `${title.slice(0, 40).trimEnd()}…` : title;
      return [root, { label: "Base de conocimiento", href: "/kb" }, { label: truncated ?? "Artículo" }];
    }
    if (pathname.startsWith("/kb")) {
      return [root, { label: "Base de conocimiento", href: "/kb" }];
    }
    if (pathname.startsWith("/bitacora/nueva")) {
      return [root, { label: "Bitácora", href: "/bitacora" }, { label: "Nueva entrada" }];
    }
    const bitacoraPath = pathname.split("/").filter(Boolean);
    if (bitacoraPath[0] === "bitacora" && bitacoraPath.length >= 2 && bitacoraPath[1]) {
      const title = bitacoraCrumbTitle?.trim();
      const truncated =
        title && title.length > 42 ? `${title.slice(0, 40).trimEnd()}…` : title;
      return [root, { label: "Bitácora", href: "/bitacora" }, { label: truncated ?? "Entrada" }];
    }
    if (pathname.startsWith("/bitacora")) {
      return [root, { label: "Bitácora", href: "/bitacora" }];
    }
    if (pathname.startsWith("/account")) {
      return [root, { label: "Mi cuenta", href: "/account" }];
    }
    if (pathname.startsWith("/lectura")) {
      return [root, { label: "Lectura de incidencias", href: "/lectura" }];
    }
    if (pathname.startsWith("/admin/analytics")) {
      return [root, { label: "Administración", href: "/admin" }, { label: "Analítica" }];
    }
    return [root];
  }, [pathname, ticketCrumbTitle, kbCrumbTitle, bitacoraCrumbTitle, desvioCrumbTitle, sessionUser?.isReadOnly]);

  const isMapaRoute = pathname.startsWith("/mapa");
  const mapaMuroChrome = isMapaRoute && mapaMuro;
  const isLecturaRoute = pathname.startsWith("/lectura");
  const lecturaMuroChrome = isLecturaRoute && lecturaMuro;
  const appChromeHidden = mapaMuroChrome || lecturaMuroChrome;

  return (
    <div
      className={
        isMapaRoute
          ? "flex h-[100dvh] min-h-0 overflow-hidden bg-[var(--color-bg)]"
          : "flex min-h-screen items-stretch bg-[var(--color-bg)]"
      }
    >
      <a
        href="#main-content"
        className="ccmgc-skip-link"
      >
        Saltar al contenido principal
      </a>
      <Suspense fallback={null}>
        <MapaMuroUrlSync setMapaMuro={setMapaMuro} />
        <LecturaMuroUrlSync setLecturaMuro={setLecturaMuro} />
      </Suspense>
      {inventoryControlRoom ? null : (
        <AppSidebar chromeFadeHidden={appChromeHidden} />
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Banner global de avisos críticos / warnings. Aparece encima del
            header cuando hay un Announcement publicado y sin leer. Se monta
            fuera del header para no romper la altura sticky de la barra
            superior. */}
        <div
          className={cn(
            "ccmgc-slide-down app-chrome-fade-out",
            appChromeHidden && "app-chrome-fade-out--hidden",
          )}
        >
          <AnnouncementsBanner />
          <Suspense fallback={null}>
            <TicketDraftsBanner />
          </Suspense>
        </div>
        <header
          className={cn(
            "ccmgc-glass-header ccmgc-app-header",
            inventoryControlRoom
              ? // En movil reservamos pl-14 para que el boton hamburguesa
                // flotante del sidebar (fixed left-4 top-4, 44px) no tape
                // los breadcrumbs ni la primera accion del header.
                "sticky top-0 z-20 flex h-11 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 pl-14 pr-3 backdrop-blur-md md:pl-4 md:pr-4"
              : "sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 pl-14 pr-3 backdrop-blur-md sm:gap-3 md:pl-4 md:pr-4 lg:pl-6 lg:pr-6",
            "app-chrome-fade-out",
            appChromeHidden && "app-chrome-fade-out--hidden",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {breadcrumbs.length > 0 ? (
            <nav
              aria-label="Migas de pan"
              // flex-nowrap en movil para evitar que las migas salten a 2
              // lineas y se salgan del header (h-14). Los crumbs intermedios
              // (todo menos el penultimo y el ultimo) se ocultan con
              // hidden sm:inline, dejando un breadcrumb compacto del tipo
              // "Tickets > Bandeja..." en lugar del trail completo.
              className="flex min-w-0 max-w-[min(100%,52rem)] flex-nowrap items-center gap-1.5 overflow-hidden text-[13px] sm:flex-wrap md:max-w-none"
            >
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                const isPenultimate = index === breadcrumbs.length - 2;
                // En movil mostramos solo el penultimo (como enlace de
                // retroceso) y el ultimo (pagina actual). El root "CCMGC" y
                // los niveles intermedios se ocultan con hidden sm:inline
                // para liberar ancho horizontal.
                const mobileVisible = isLast || isPenultimate;
                return (
                  <Fragment key={`${crumb.label}-${index}`}>
                    {index > 0 ? (
                      <ChevronRight
                        size={13}
                        strokeWidth={1.5}
                        className={
                          (mobileVisible && !isPenultimate
                            ? "inline"
                            : "hidden sm:inline") +
                          " shrink-0 text-[var(--color-text-3)]/60"
                        }
                        aria-hidden
                      />
                    ) : null}
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className={
                          (mobileVisible ? "inline-flex" : "hidden sm:inline-flex") +
                          " ccmgc-link-hover min-w-0 shrink-0 max-w-[10rem] truncate text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-1)] sm:max-w-none"
                        }
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        key={isLast ? pathname : undefined}
                        className={cn(
                          isLast
                            ? "breadcrumb-fade-in min-w-0 flex-1 truncate font-semibold text-[var(--color-text-1)] sm:flex-none sm:max-w-[24rem] md:max-w-[32rem]"
                            : "min-w-0 shrink-0 truncate text-[var(--color-text-3)]",
                          mobileVisible ? "inline" : "hidden sm:inline",
                        )}
                        title={isLast ? crumb.label : undefined}
                        aria-current={isLast ? "page" : undefined}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </Fragment>
                );
              })}
            </nav>
            ) : null}
            {sessionUser?.isReadOnly ? (
              <span className="hidden shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-3)] sm:inline-flex">
                Solo lectura
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Busqueda movil: icono compacto (desktop mantiene campo amplio). */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("ccmgc-open-quick-search"))}
              title="Búsqueda rápida (Ctrl+K)"
              aria-label="Abrir búsqueda rápida"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)]/70 hover:text-[var(--color-accent)] md:hidden"
            >
              <Search size={16} strokeWidth={1.6} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("ccmgc-open-quick-search"))}
              title="Búsqueda rápida (Ctrl+K)"
              aria-label="Abrir búsqueda rápida"
              className="group hidden h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg bg-[var(--color-surface-2)]/30 px-3 text-[12.5px] text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)]/55 hover:text-[var(--color-text-2)] md:inline-flex md:max-w-[18rem] lg:max-w-[20rem]"
            >
              <Search
                size={14}
                strokeWidth={1.6}
                className="shrink-0 text-[var(--color-text-3)] transition-colors group-hover:text-[var(--color-accent)]"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-left">Buscar en CCMGC…</span>
              <span className="shrink-0 font-mono text-[10px] font-medium tracking-wide text-[var(--color-text-3)]/75">
                Ctrl K
              </span>
            </button>
            <span className="mx-0.5 hidden h-5 w-px bg-[var(--color-border)]/45 md:block" aria-hidden />
            <div className="flex items-center gap-0.5" role="group" aria-label="Atajos del centro de control">
              <ClockChip />
              <DensityToggle />
              <NotificationBell />
            </div>
            <HeaderUserMenu user={sessionUser} />
          </div>
        </header>
        <main
          id="main-content"
          // overflow-y-auto + overflow-x-hidden: bloqueamos scroll
          // horizontal global del shell. Cualquier tabla o panel que
          // realmente necesite scroll horizontal debe envolverse en
          // overflow-x-auto local; asi un panel mal medido no rompe la
          // pagina entera ni provoca que la barra inferior aparezca en
          // movil cuando un descendiente se sale por la derecha.
          className={
            inventoryControlRoom
              ? "min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-2 md:px-4 md:pb-4 md:pt-3"
              : appChromeHidden
                ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-1 pb-1 pt-1 sm:px-2 sm:pb-2 sm:pt-2"
              : isMapaRoute
                ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-3 sm:px-4 md:px-6 md:pb-6 md:pt-4"
                // Padding reducido en movil para no robar 48px (px-6) que en
                // pantallas de 320px son el 15% del ancho. En tablets y
                // desktop volvemos al ritmo de 24px.
                : "min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 pt-3 sm:px-4 md:px-6 md:pb-6 md:pt-4"
          }
        >
          <ClientErrorBoundary>{children}</ClientErrorBoundary>
        </main>
      </div>
      <FeedbackModal
        open={feedbackOpen}
        target={feedbackTarget}
        onClose={() => {
          setFeedbackOpen(false);
          setFeedbackTarget(null);
        }}
      />
      <MotionPrefSync />
      <NavigationProgress />
      <QuickSearch />
      <ToastHost />
      <GlobalShortcuts />
      <DesvioNotificationsListener />
      <DesvioConfirmReminder sessionUser={sessionUser} />
      <AnnouncementsToastListener />
      <OfflineQueueIndicator />
      <PushNotificationPrompt />
      {/* El FAB de feedback no aplica a cuentas de solo lectura: no pueden enviar nada. */}
      {sessionUser?.isReadOnly ? null : <FeedbackFAB />}
    </div>
  );
}
