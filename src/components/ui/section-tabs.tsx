"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";

import { resolveSectionTabsPreset, type SectionTabsPresetId } from "@/components/section-tabs-presets";
import type { SessionUser, UserRole } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type SectionTab = {
  label: string;
  href: string;
  icon?: LucideIcon;
  /**
   * Si está definido y devuelve `false`, la pestaña se oculta para ese rol.
   */
  visibleTo?: (role: UserRole) => boolean;
  /**
   * Función opcional para marcar la pestaña como activa. Por defecto se compara
   * con `pathname === href` o `pathname.startsWith(href + "/")`.
   */
  match?: (pathname: string) => boolean;
};

type Props = {
  /**
   * Identificador del preset (definido en `section-tabs-presets.tsx`). Usamos
   * un id en lugar del array directamente para que los Server Components
   * puedan renderizar `<SectionTabs preset="dashboard" />` sin pasar funciones
   * como props (Next.js prohíbe serializar funciones de SC → CC).
   */
  preset: SectionTabsPresetId;
  className?: string;
  size?: "md" | "sm";
};

/**
 * Barra de pestañas para secciones del menú que se han unificado bajo un mismo
 * paraguas (p. ej. Dashboard / Reportes / Cuadros). Cada tab es un `Link` real
 * — no manipulamos estado, navegamos a la URL hija. Así las URLs siguen siendo
 * direccionables y compatibles con bookmarks / refresh.
 *
 * El componente carga la sesión por sí mismo para filtrar tabs por rol.
 * Mientras carga muestra solo las tabs SIN `visibleTo` para evitar parpadeo
 * de "aparece y desaparece" en roles restringidos.
 */
export function SectionTabs({ preset, className, size = "md" }: Props) {
  const tabs = resolveSectionTabsPreset(preset);
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setSessionLoaded(true);
          return;
        }
        const data = (await res.json()) as {
          authenticated: boolean;
          user?: SessionUser;
        };
        if (cancelled) return;
        if (data.authenticated && data.user) {
          setRole(data.user.role);
        }
        setSessionLoaded(true);
      } catch {
        if (!cancelled) setSessionLoaded(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleTabs = useMemo(() => {
    return tabs.filter((tab) => {
      if (!tab.visibleTo) return true;
      if (!sessionLoaded || !role) return false;
      return tab.visibleTo(role);
    });
  }, [tabs, role, sessionLoaded]);

  // No tiene sentido pintar una sola pestaña: sería ruido visual.
  if (visibleTabs.length < 2) return null;

  return (
    <nav
      className={cn(
        "relative -mx-1 mb-4 flex items-center gap-1 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1",
        className,
      )}
      aria-label="Sub-secciones"
    >
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.match
          ? tab.match(pathname)
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "group inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all duration-150",
              size === "sm" && "px-2.5 py-1 text-[13px]",
              isActive
                ? "bg-[var(--color-accent-light)] font-semibold text-[var(--color-accent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_30%,transparent)]"
                : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {Icon ? (
              <Icon
                size={size === "sm" ? 13 : 15}
                strokeWidth={1.6}
                className={cn(
                  "shrink-0",
                  isActive
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-text-3)] group-hover:text-[var(--color-text-1)]",
                )}
              />
            ) : null}
            <span className="truncate">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
