"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  ChartNoAxesCombined,
  ClipboardList,
  LayoutDashboard,
  MapPinned,
  Menu,
  MessageSquarePlus,
  Package,
  UserCircle2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CcmgcLogo } from "@/components/ccmgc-logo";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/domain";

const menu = [
  { label: "Dashboard", icon: ChartNoAxesCombined, href: "/dashboard" },
  { label: "Custom Dashboards", icon: LayoutDashboard, href: "/dashboards" },
  { label: "Tickets", icon: ClipboardList, href: "/tickets" },
  { label: "Inventario", icon: Package, href: "/inventory" },
  { label: "Mapa", icon: MapPinned, href: "/mapa" },
  { label: "Base de Conocimiento", icon: BookOpenCheck, href: "#" },
  { label: "Feedback", icon: MessageSquarePlus, href: "/feedback" },
  { label: "Administración", icon: UserCircle2, href: "/admin" },
];

const SIDEBAR_STATE_KEY = "ccmgc_sidebar_expanded";

type AppSidebarProps = {
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onExpandedChange?: (expanded: boolean) => void;
};

export function AppSidebar({ expanded: expandedProp, onToggleExpanded, onExpandedChange }: AppSidebarProps) {
  const [open, setOpen] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(true);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [tooltip, setTooltip] = useState<{ label: string; y: number } | null>(null);
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

  const userInitials = useMemo(() => {
    if (!sessionUser?.name) return "SS";
    const parts = sessionUser.name.trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }, [sessionUser?.name]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/admin") return pathname.startsWith("/admin");
    if (href === "/inventory") return pathname.startsWith("/inventory");
    if (href === "/mapa") return pathname.startsWith("/mapa");
    return pathname.startsWith(href) && href !== "#";
  };

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
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="min-w-0 flex-1 rounded-lg p-0.5 outline-none ring-offset-2 ring-offset-[var(--color-surface)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              >
                <CcmgcLogo className="h-11 w-full max-w-[11.5rem]" />
              </Link>
              <button
                onClick={() => (onToggleExpanded ? onToggleExpanded() : setExpanded(false))}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-3)] transition-all duration-150 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
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
            "flex-1 py-2 space-y-1",
            expanded ? "overflow-y-auto px-2" : "overflow-hidden px-1",
          )}
        >
          {menu.map(({ label, icon: Icon, href }) => (
            <div key={label} className="group relative">
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
                    ? "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5"
                    : "group relative mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-xl",
                  isActive(href)
                    ? "bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]"
                    : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
                )}
              >
                <Icon
                  size={expanded ? 16 : 18}
                  className={cn(
                    isActive(href)
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-text-3)] group-hover:text-[var(--color-text-1)]",
                  )}
                />
                {expanded ? label : null}
              </Link>
            </div>
          ))}
        </nav>

        <div className="flex-shrink-0 border-t border-[var(--color-border)] px-3 py-3">
          {expanded ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-xs font-semibold text-[var(--color-accent)]">
                  {userInitials}
                </div>
                <div>
                  <p className="text-caption text-[var(--color-text-1)]">{sessionUser?.name ?? "Sin sesion"}</p>
                  <p className="text-caption">{sessionUser?.role ?? "Sin sesion"}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-xs font-medium text-[var(--color-accent)]">
                {userInitials}
              </div>
            </div>
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
