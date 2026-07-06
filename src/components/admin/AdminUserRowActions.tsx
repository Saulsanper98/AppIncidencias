"use client";

import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, MoreHorizontal, Pencil, Trash2, UserCheck, UserMinus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { fadeScale, motionTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

type ActionLabels = {
  edit: string;
  resetPassword: string;
  deactivate: string;
  activate: string;
  delete: string;
  more: string;
  deactivateSelfTitle?: string;
};

type Props = {
  disabled?: boolean;
  isSelf?: boolean;
  isActive: boolean;
  labels: ActionLabels;
  onEdit: () => void;
  onResetPassword: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onDelete: () => void;
  className?: string;
};

function IconAction({
  label,
  disabled,
  onClick,
  children,
  className,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--color-text-2)] transition-colors",
        "hover:border-[var(--color-border)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function AdminUserRowActions({
  disabled,
  isSelf,
  isActive,
  labels,
  onEdit,
  onResetPassword,
  onDeactivate,
  onActivate,
  onDelete,
  className,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewport, setViewport] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) {
      setViewport(null);
      return;
    }
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 196;
      const left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8);
      setViewport({ top: rect.bottom + 6, left: Math.max(8, left) });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const menu = document.querySelector("[data-admin-user-actions-menu]");
      if (menu?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const run = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  return (
    <div className={cn("flex shrink-0 items-center gap-0.5", className)}>
      <IconAction label={labels.edit} disabled={disabled} onClick={onEdit}>
        <Pencil size={14} strokeWidth={1.75} aria-hidden />
      </IconAction>
      <IconAction label={labels.resetPassword} disabled={disabled} onClick={onResetPassword}>
        <KeyRound size={14} strokeWidth={1.75} aria-hidden />
      </IconAction>
      <button
        ref={triggerRef}
        type="button"
        title={labels.more}
        aria-label={labels.more}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setMenuOpen((open) => !open)}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--color-text-2)] transition-colors",
          "hover:border-[var(--color-border)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface)]",
          "disabled:cursor-not-allowed disabled:opacity-45",
          menuOpen && "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-1)]",
        )}
      >
        <MoreHorizontal size={15} strokeWidth={2} aria-hidden />
      </button>

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {menuOpen && viewport ? (
                <motion.ul
                  key="admin-user-actions-menu"
                  data-admin-user-actions-menu
                  role="menu"
                  style={{
                    position: "fixed",
                    top: viewport.top,
                    left: viewport.left,
                    minWidth: "12.25rem",
                    zIndex: 90,
                  }}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl"
                  variants={fadeScale}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={motionTransition(0.15)}
                >
                  {isActive ? (
                    <li role="none">
                      <button
                        type="button"
                        role="menuitem"
                        disabled={disabled || isSelf}
                        title={isSelf ? labels.deactivateSelfTitle : undefined}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-light)] disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => run(onDeactivate)}
                      >
                        <UserMinus size={13} className="shrink-0 opacity-80" aria-hidden />
                        {labels.deactivate}
                      </button>
                    </li>
                  ) : (
                    <li role="none">
                      <button
                        type="button"
                        role="menuitem"
                        disabled={disabled}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-success)] transition-colors hover:bg-[var(--color-success-light)] disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => run(onActivate)}
                      >
                        <UserCheck size={13} className="shrink-0 opacity-80" aria-hidden />
                        {labels.activate}
                      </button>
                    </li>
                  )}
                  <li role="none">
                    <hr className="my-1 border-[var(--color-border)]" />
                  </li>
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={disabled || isSelf}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-light)] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => run(onDelete)}
                    >
                      <Trash2 size={13} className="shrink-0 opacity-80" aria-hidden />
                      {labels.delete}
                    </button>
                  </li>
                </motion.ul>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
