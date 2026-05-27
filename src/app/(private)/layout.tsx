"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";

import { AnnouncementsBanner } from "@/components/novedades/AnnouncementsBanner";
import { AnnouncementsToastListener } from "@/components/novedades/AnnouncementsToastListener";
import { AppSidebar } from "@/components/app-sidebar";
import { ClockChip } from "@/components/clock-chip";
import { DensityToggle } from "@/components/density-toggle";
import { DesvioNotificationsListener } from "@/components/desvios/DesvioNotificationsListener";
import { FeedbackModal } from "@/components/feedback/FeedbackModal";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { HeaderUserMenu } from "@/components/header-user-menu";
import { NotificationBell } from "@/components/notification-bell";
import { OfflineQueueIndicator } from "@/components/OfflineQueueIndicator";
import { QuickSearch } from "@/components/quick-search";
import { ToastHost } from "@/components/toast-host";
import type { SessionUser } from "@/lib/domain";
import type { FeedbackPrefillTarget } from "@/components/feedback/FeedbackForm";

function MapaMuroUrlSync({ setMapaMuro }: { setMapaMuro: (value: boolean) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const active = pathname.startsWith("/mapa") && searchParams.get("muro") === "1";
    setMapaMuro(active);
  }, [pathname, searchParams, setMapaMuro]);
  return null;
}

export default function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [ticketCrumbTitle, setTicketCrumbTitle] = useState<string | null>(null);
  const [inventoryControlRoom, setInventoryControlRoom] = useState(false);
  const [mapaMuro, setMapaMuro] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackPrefillTarget | null>(null);
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

  useEffect(() => {
    const onInvSurface = (e: Event) => {
      const ce = e as CustomEvent<{ active?: boolean }>;
      setInventoryControlRoom(Boolean(ce.detail?.active));
    };
    window.addEventListener("ccmgc-inventory-control-room", onInvSurface as EventListener);
    return () => window.removeEventListener("ccmgc-inventory-control-room", onInvSurface as EventListener);
  }, []);

  useEffect(() => {
    const onOpenFeedback = (e: Event) => {
      const ce = e as CustomEvent<FeedbackPrefillTarget>;
      if (ce.detail?.id && ce.detail?.label) {
        setFeedbackTarget({ id: ce.detail.id, label: ce.detail.label });
      }
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
      return [root, { label: "Tickets", href: "/tickets" }, { label }];
    }
    if (pathname.startsWith("/tickets")) {
      return [root, { label: "Tickets", href: "/tickets" }, { label: "Bandeja y nuevo ticket" }];
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
    return [root];
  }, [pathname, ticketCrumbTitle]);

  const isMapaRoute = pathname.startsWith("/mapa");
  const mapaMuroChrome = isMapaRoute && mapaMuro;

  return (
    <div
      className={
        isMapaRoute
          ? "flex h-[100dvh] min-h-0 overflow-hidden bg-[var(--color-bg)]"
          : "flex min-h-screen bg-[var(--color-bg)]"
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
      </Suspense>
      {inventoryControlRoom || mapaMuro ? null : <AppSidebar />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Banner global de avisos críticos / warnings. Aparece encima del
            header cuando hay un Announcement publicado y sin leer. Se monta
            fuera del header para no romper la altura sticky de la barra
            superior. */}
        {mapaMuroChrome ? null : <AnnouncementsBanner />}
        {mapaMuroChrome ? null : (
        <header
          className={
            inventoryControlRoom
              ? "sticky top-0 z-20 flex h-11 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 px-3 backdrop-blur-md md:px-4"
              : "sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 backdrop-blur-md md:px-6"
          }
        >
          <nav
            aria-label="Migas de pan"
            className="flex min-w-0 max-w-[min(100%,52rem)] flex-wrap items-center gap-1.5 text-[13px] md:max-w-none"
          >
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 ? (
                    <ChevronRight
                      size={13}
                      strokeWidth={1.5}
                      className="shrink-0 text-[var(--color-text-3)]/60"
                      aria-hidden
                    />
                  ) : null}
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className="shrink-0 text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-1)]"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={
                        isLast
                          ? "min-w-0 max-w-[16rem] truncate font-semibold text-[var(--color-text-1)] sm:max-w-[24rem] md:max-w-[32rem]"
                          : "min-w-0 truncate text-[var(--color-text-3)]"
                      }
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
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Búsqueda: campo amplio con icono y atajo. Se parece a un input
                real para que el usuario lo identifique como "buscador del
                centro de control" en lugar de un botón sin contexto. */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("ccmgc-open-quick-search"))}
              title="Búsqueda rápida (Ctrl+K)"
              aria-label="Abrir búsqueda rápida"
              className="group hidden h-9 w-[15rem] items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/55 pl-2.5 pr-1.5 text-[12.5px] text-[var(--color-text-3)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-150 hover:border-[var(--color-accent)]/45 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-2)] hover:shadow-[0_4px_14px_-10px_rgba(0,0,0,0.55)] md:inline-flex lg:w-[18rem]"
            >
              <Search
                size={14}
                strokeWidth={1.6}
                className="shrink-0 text-[var(--color-text-3)] transition-colors group-hover:text-[var(--color-accent)]"
                aria-hidden
              />
              <span className="flex-1 text-left">Buscar en CCMGC…</span>
              <span className="kbd shrink-0">Ctrl K</span>
            </button>
            {/* Trío de utilidades: reloj + densidad + notificaciones */}
            <div
              className="flex h-9 items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              role="group"
              aria-label="Atajos del centro de control"
            >
              <ClockChip />
              <span className="h-5 w-px bg-[var(--color-border)]/70" aria-hidden />
              <DensityToggle />
              <span className="h-5 w-px bg-[var(--color-border)]/70" aria-hidden />
              <NotificationBell />
            </div>
            <HeaderUserMenu user={sessionUser} />
          </div>
        </header>
        )}
        <main
          id="main-content"
          className={
            inventoryControlRoom
              ? "flex-1 overflow-auto px-3 pb-3 pt-2 md:px-4 md:pb-4 md:pt-3"
              : mapaMuroChrome
                ? "flex min-h-0 flex-1 flex-col overflow-hidden px-1 pb-1 pt-1 sm:px-2 sm:pb-2 sm:pt-2"
              : isMapaRoute
                ? "flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-4"
                : "flex-1 overflow-auto px-6 pb-6 pt-4"
          }
        >
          {children}
        </main>
      </div>
      <FeedbackModal
        target={feedbackTarget}
        onClose={() => setFeedbackTarget(null)}
      />
      <QuickSearch />
      <ToastHost />
      <GlobalShortcuts />
      <DesvioNotificationsListener />
      <AnnouncementsToastListener />
      <OfflineQueueIndicator />
    </div>
  );
}
