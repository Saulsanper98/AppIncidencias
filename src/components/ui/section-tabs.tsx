"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

import { resolveSectionTabsPreset, type SectionTabsPresetId } from "@/components/section-tabs-presets";
import type { SessionUser, UserRole } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type SectionTab = {
  label: string;
  href: string;
  icon?: LucideIcon;
  visibleTo?: (role: UserRole) => boolean;
  match?: (pathname: string) => boolean;
};

type Props = {
  preset: SectionTabsPresetId;
  className?: string;
  size?: "md" | "sm";
  /** `underline` = sin caja (recomendado). `boxed` = segmented control con borde. */
  variant?: "underline" | "boxed";
};

export function SectionTabs({ preset, className, size = "md", variant = "underline" }: Props) {
  const tabs = resolveSectionTabsPreset(preset);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [trackStyle, setTrackStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

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

  const activeIndex = useMemo(() => {
    return visibleTabs.findIndex((tab) =>
      tab.match ? tab.match(pathname) : pathname === tab.href || pathname.startsWith(`${tab.href}/`),
    );
  }, [visibleTabs, pathname]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || activeIndex < 0) {
      setTrackStyle({ left: 0, width: 0 });
      return;
    }
    const measure = () => {
      const links = nav.querySelectorAll<HTMLElement>("a");
      const active = links[activeIndex];
      if (!active) return;
      const navRect = nav.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      setTrackStyle({
        left: activeRect.left - navRect.left + nav.scrollLeft,
        width: activeRect.width,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    nav.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      nav.removeEventListener("scroll", measure);
    };
  }, [activeIndex, visibleTabs, pathname, size]);

  if (visibleTabs.length < 2) return null;

  return (
    <nav
      ref={navRef}
      className={cn(
        "section-tabs-scroll-fade relative flex items-center overflow-x-auto",
        variant === "boxed"
          ? "section-tabs-track -mx-1 mb-4 gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
          : "section-tabs-underline-track mb-3 gap-0.5 border-b border-[var(--color-border)]/50",
        className,
      )}
      style={
        {
          "--tab-left": `${trackStyle.left}px`,
          "--tab-width": `${trackStyle.width}px`,
        } as React.CSSProperties
      }
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
              "relative z-[1] inline-flex shrink-0 items-center gap-2 transition-all duration-150",
              variant === "boxed"
                ? cn(
                    "rounded-lg px-3 py-1.5 text-sm",
                    size === "sm" && "px-2.5 py-1 text-[13px]",
                    isActive
                      ? "segmented-pill--active font-semibold"
                      : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
                  )
                : cn(
                    "border-b-2 border-transparent -mb-px px-3 py-2 text-sm",
                    size === "sm" && "px-2.5 py-1.5 text-[13px]",
                    isActive
                      ? "font-semibold text-[var(--color-accent)]"
                      : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
                  ),
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
                    ? variant === "boxed"
                      ? "text-white"
                      : "text-[var(--color-accent)]"
                    : "text-[var(--color-text-3)]",
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
