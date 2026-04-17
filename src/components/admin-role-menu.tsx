"use client";

import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { UserRole } from "@/lib/domain";
import { userRoleLabel } from "@/lib/user-role-labels";
import { cn } from "@/lib/utils";

const ROLES: UserRole[] = ["conductor", "tecnico_campo", "gestor_centro_control"];

type AdminRoleMenuProps = {
  value: UserRole;
  onCommit: (role: UserRole) => void;
  disabled?: boolean;
  locale?: "es" | "en";
  className?: string;
  /** Ancho completo (p. ej. tarjetas móviles) */
  fullWidth?: boolean;
  /** Fila de tabla más baja */
  compact?: boolean;
};

const triggerCompact =
  "flex w-full min-h-[30px] items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-left text-[11px] font-medium leading-tight text-[var(--color-text-1)] transition-colors hover:border-[color-mix(in_oklab,var(--color-border-hover)_70%,var(--color-border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50";

const triggerDefault =
  "flex w-full min-h-[36px] items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--color-text-1)] transition-colors hover:border-[color-mix(in_oklab,var(--color-border-hover)_70%,var(--color-border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50";

const panelClass =
  "max-h-52 overflow-y-auto rounded-xl border border-[color-mix(in_oklab,var(--color-border)_88%,transparent)] bg-[color-mix(in_oklab,var(--color-surface-2)_98%,var(--color-surface))] p-1 shadow-[0_14px_36px_-12px_rgba(0,0,0,0.5)]";

export function AdminRoleMenu({
  value,
  onCommit,
  disabled,
  locale = "es",
  className,
  fullWidth,
  compact,
}: AdminRoleMenuProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuBox, setMenuBox] = useState({ top: 0, left: 0, width: 200 });
  const openRef = useRef(false);
  openRef.current = open;

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setMenuBox({
      top: r.bottom + 6,
      left: r.left,
      width: Math.max(r.width, compact ? 180 : 200),
    });
  }, [open, value, compact]);

  useLayoutEffect(() => {
    if (!open) return;
    const idx = Math.max(0, ROLES.indexOf(value));
    requestAnimationFrame(() => {
      const el = panelRef.current?.querySelectorAll<HTMLButtonElement>(`[data-role-option]`)[idx];
      el?.focus();
    });
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openRef.current) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const label = userRoleLabel(value, locale);
  const triggerClass = compact ? triggerCompact : triggerDefault;

  const panel = open ? (
    <div
      ref={panelRef}
      id={listId}
      role="listbox"
      style={{
        position: "fixed",
        top: menuBox.top,
        left: menuBox.left,
        width: menuBox.width,
        zIndex: 200,
      }}
      className={cn(panelClass, fullWidth && "max-w-none")}
    >
      {ROLES.map((role) => {
        const active = role === value;
        return (
          <button
            key={role}
            type="button"
            role="option"
            data-role-option
            aria-selected={active}
            className={cn(
              "flex w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
              active
                ? "bg-[color-mix(in_oklab,var(--color-accent)_20%,var(--color-surface-3))] font-semibold text-[var(--color-text-1)]"
                : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]",
            )}
            onClick={() => {
              onCommit(role);
              setOpen(false);
              triggerRef.current?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                triggerRef.current?.focus();
              }
            }}
          >
            {userRoleLabel(role, locale)}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={cn("relative min-w-0", fullWidth ? "block w-full" : "inline-block max-w-[220px]")}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        disabled={disabled}
        className={cn(triggerClass, fullWidth && "!max-w-none", className)}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown size={14} className={cn("shrink-0 text-[var(--color-text-3)]", open && "rotate-180")} aria-hidden />
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
