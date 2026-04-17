"use client";

import { Bell, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import type { SessionUser } from "@/lib/domain";

export default function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [ticketCrumbTitle, setTicketCrumbTitle] = useState<string | null>(null);
  const [inventoryControlRoom, setInventoryControlRoom] = useState(false);

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
      return [root, { label: "Administracion", href: "/admin/users" }, { label: "Usuarios" }];
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

  return (
    <div
      className={
        isMapaRoute
          ? "flex h-[100dvh] min-h-0 overflow-hidden bg-[var(--color-bg)]"
          : "flex min-h-screen bg-[var(--color-bg)]"
      }
    >
      {inventoryControlRoom ? null : <AppSidebar />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className={
            inventoryControlRoom
              ? "sticky top-0 z-20 flex h-11 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 px-3 backdrop-blur-md md:px-4"
              : "sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 backdrop-blur-md md:px-6"
          }
        >
          <nav
            aria-label="Migas de pan"
            className="flex min-w-0 max-w-[min(100%,52rem)] flex-wrap items-center gap-1.5 rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-surface-2)]/50 px-2.5 py-1.5 text-sm md:max-w-none"
          >
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 ? <ChevronRight size={14} className="shrink-0 text-[var(--color-text-3)]" aria-hidden /> : null}
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
                          ? "min-w-0 max-w-[12rem] truncate rounded-md bg-[var(--color-surface-3)] px-2 py-0.5 font-medium text-[var(--color-text-1)] sm:max-w-[20rem] md:max-w-[28rem]"
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
          <div className="flex items-center gap-3">
            <button className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-2)] transition-all duration-150 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]">
              <Bell size={16} />
            </button>
            <span className="h-6 w-px bg-[var(--color-border)]" />
            <p className="text-caption text-[var(--color-text-1)]">{sessionUser?.name ?? "Sin sesion"}</p>
          </div>
        </header>
        <main
          className={
            inventoryControlRoom
              ? "flex-1 overflow-auto px-3 pb-3 pt-2 md:px-4 md:pb-4 md:pt-3"
              : isMapaRoute
                ? "flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-4"
                : "flex-1 overflow-auto px-6 pb-6 pt-4"
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
