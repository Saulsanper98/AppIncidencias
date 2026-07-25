"use client";

import { ChevronDown, KeyRound, LogOut, UserCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveAccountImageUrl } from "@/lib/account-media";
import { CENTRAL_VIEWER_LABEL } from "@/lib/central-viewer";
import type { SessionUser, UserRole } from "@/lib/domain";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<UserRole, string> = {
  conductor: "Conductor",
  tecnico_campo: "Técnico de campo",
  gestor_centro_control: "Gestor del centro de control",
};

function initialsFromName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

type HeaderUserMenuProps = {
  user: SessionUser | null;
};

export function HeaderUserMenu({ user }: HeaderUserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initials = useMemo(() => initialsFromName(user?.name ?? "?"), [user?.name]);
  // Normalizamos URLs heredadas: las imagenes subidas en runtime se sirven
  // via /api/account-media/... no via /uploads/... (ver lib/account-media.ts).
  const avatarSrc = resolveAccountImageUrl(user?.avatarUrl);
  const bannerSrc = resolveAccountImageUrl(user?.bannerUrl);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      window.location.assign("/login");
    }
  };

  if (!user) {
    return (
      <p className="text-caption text-[var(--color-text-1)]" aria-live="polite">
        Sin sesion
      </p>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          // Card compacta con banner de fondo. `overflow-hidden` recorta la
          // imagen al rounded-full; `isolate` evita que el overlay se filtre
          // a hermanos cuando hay efectos.
          "group relative isolate flex items-center gap-2 overflow-hidden rounded-full border border-[var(--color-border)]/60 pl-1 pr-2.5 py-1 transition-all duration-200",
          "hover:border-[var(--color-accent)]/45 hover:shadow-[0_6px_18px_-10px_rgba(0,0,0,0.65)]",
          open && "border-[var(--color-accent)]/55 shadow-[0_6px_18px_-10px_rgba(0,0,0,0.7)]",
        )}
      >
        {/* Fondo: banner del usuario o gradiente neutro si no lo tiene */}
        {bannerSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bannerSrc}
              alt=""
              aria-hidden
              className="absolute inset-0 -z-10 h-full w-full object-cover opacity-70 transition-opacity duration-200 group-hover:opacity-80"
            />
            {/* Overlay para asegurar contraste con texto claro */}
            <span
              aria-hidden
              className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--color-surface)]/85 via-[var(--color-surface)]/55 to-[var(--color-surface)]/85"
            />
          </>
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--color-surface-2)] via-[var(--color-surface)] to-[var(--color-surface-2)]"
          />
        )}

        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt={user.name}
            className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-[var(--color-surface)]/80"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[11px] font-semibold text-[var(--color-accent)] ring-2 ring-[var(--color-surface)]/80">
            {initials}
          </span>
        )}
        <span className="hidden min-w-0 flex-col items-start text-left sm:flex">
          <span className="max-w-[10rem] truncate text-[12px] font-semibold leading-tight text-[var(--color-text-1)] drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">
            {user.name}
          </span>
          <span className={cn(
            "max-w-[10rem] truncate text-[10px] leading-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]",
            user.isReadOnly
              ? "font-semibold text-[var(--color-accent)]"
              : "text-[var(--color-text-2)]",
          )}>
            {user.isReadOnly ? CENTRAL_VIEWER_LABEL : ROLE_LABEL[user.role]}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 text-[var(--color-text-2)] transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_18px_48px_-14px_rgba(0,0,0,0.55)]"
        >
          {/* Cabecera con banner de cubierta + avatar + nombre */}
          <div className="relative h-20 overflow-hidden bg-[var(--color-surface-2)]">
            {bannerSrc ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bannerSrc}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)]/40 to-transparent"
                />
              </>
            ) : (
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-to-br from-[var(--color-accent)]/20 via-[var(--color-surface-2)] to-[var(--color-surface)]"
              />
            )}
          </div>
          <div className="relative -mt-7 px-2.5 pb-2">
            <div className="flex items-end gap-2">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt=""
                  aria-hidden
                  className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-[var(--color-surface)]"
                />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[14px] font-semibold text-[var(--color-accent)] ring-2 ring-[var(--color-surface)]">
                  {initials}
                </span>
              )}
              <div className="min-w-0 pb-0.5">
                <p className="truncate text-[13.5px] font-semibold text-[var(--color-text-1)]">{user.name}</p>
                <p className="truncate text-[11px] text-[var(--color-text-3)]">
                  {user.position?.trim() ? user.position : user.email}
                </p>
              </div>
            </div>
          </div>
          <div className="mx-1.5 mb-1 h-px bg-[var(--color-border)]" />
          <div className="p-1.5 pt-0">
            <MenuItem
              icon={<UserCircle2 size={14} aria-hidden />}
              label="Mi cuenta"
              onClick={() => {
                setOpen(false);
                router.push("/account");
              }}
            />
            <MenuItem
              icon={<KeyRound size={14} aria-hidden />}
              label="Cambiar contraseña"
              onClick={() => {
                setOpen(false);
                router.push("/account/cambiar-password");
              }}
            />
            <div className="my-1 h-px bg-[var(--color-border)]" />
            <MenuItem
              icon={<LogOut size={14} aria-hidden />}
              label="Cerrar sesión"
              tone="danger"
              onClick={handleLogout}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
        tone === "danger"
          ? "text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
          : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
      )}
    >
      <span
        className={cn(
          tone === "danger" ? "text-rose-300" : "text-[var(--color-text-3)]",
          "shrink-0",
        )}
      >
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
