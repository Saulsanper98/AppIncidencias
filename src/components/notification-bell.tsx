"use client";

import { Bell, Check } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSseEvent } from "@/hooks/use-sse-event";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  label: string;
  href: string;
  createdAt: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [shake, setShake] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useSseEvent("notifications", (event) => {
    try {
      const parsed = JSON.parse(event.data) as { unread?: number };
      const next = Math.max(0, Number(parsed.unread ?? 0));
      if (next > prevCountRef.current) {
        setShake(true);
        window.setTimeout(() => setShake(false), 400);
      }
      prevCountRef.current = next;
      setCount(next);
    } catch {
      prevCountRef.current = 0;
      setCount(0);
    }
  });

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/notifications/list", { cache: "no-store", credentials: "include" });
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = (await res.json()) as { items?: NotificationItem[] };
      setItems(data.items ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const clearAll = useCallback(async () => {
    if (clearing) return;
    setClearing(true);
    try {
      const res = await fetch("/api/notifications/clear", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setItems([]);
        setCount(0);
      }
    } catch (error) {
      console.warn("notifications clear:", error);
    } finally {
      setClearing(false);
    }
  }, [clearing]);

  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || !(e.target instanceof Node)) return;
      if (!el.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)]/70 hover:text-[var(--color-text-1)]",
          open && "bg-[var(--color-accent-light)]/80 text-[var(--color-accent)]",
          shake && "ccmgc-shake",
        )}
      >
        <Bell size={15} strokeWidth={1.6} />
        {count > 0 ? (
          <span
            className={cn(
              "inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-[var(--color-error)] px-1 text-[10px] font-semibold leading-4 text-white shadow-[0_0_0_2px_var(--color-surface)]",
              "ccmgc-badge-pop",
            )}
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Cerrar notificaciones"
            onClick={() => setOpen(false)}
            className="ccmgc-notification-backdrop fixed inset-0 z-[200] sm:hidden"
          />
          <div
            id="ccmgc-notification-panel"
            role="menu"
            className={cn(
              "ccmgc-notification-panel notification-panel-enter z-[210] overflow-hidden",
              // Móvil: panel fijo bajo el header. Desktop: dropdown anclado a la campana.
              "fixed left-2 right-2 top-[calc(env(safe-area-inset-top,0px)+3.5rem)] mx-auto max-h-[min(70vh,24rem)]",
              "sm:absolute sm:inset-auto sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem] sm:max-h-[min(70vh,24rem)]",
            )}
          >
            <div className="ccmgc-notification-panel__head flex items-start justify-between gap-2 px-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <span className="ccmgc-notification-panel__icon shrink-0" aria-hidden>
                  <Bell size={14} strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--color-text-1)]">Notificaciones</p>
                  <p className="text-[10px] text-[var(--color-text-3)]">Actividad reciente del sistema</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void clearAll()}
                disabled={clearing || (items.length === 0 && count === 0)}
                title="Marcar como leídas todas las notificaciones actuales"
                className="desvios-action-chip !h-8 shrink-0 px-2 text-[10.5px] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check size={11} aria-hidden />
                {clearing ? "Limpiando…" : "Limpiar"}
              </button>
            </div>
            <div className="max-h-[min(60vh,20rem)] overflow-y-auto">
              {loadingList ? (
                <p className="px-3 py-4 text-center text-xs text-[var(--color-text-3)]">Cargando…</p>
              ) : items.length === 0 ? (
                <div className="ccmgc-notification-panel__empty">
                  <Bell size={18} strokeWidth={1.5} className="mx-auto mb-2 text-[var(--color-text-3)]/80" aria-hidden />
                  <p className="text-xs font-medium text-[var(--color-text-2)]">No hay elementos recientes</p>
                  <p className="mt-1 text-[10px] text-[var(--color-text-3)]">
                    Los avisos de tickets y mantenimiento aparecerán aquí.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        role="menuitem"
                        onClick={() => setOpen(false)}
                        className="block px-3 py-2.5 text-left text-sm text-[var(--color-text-1)] transition-colors hover:bg-[var(--color-surface-3)]/55"
                      >
                        <span className="line-clamp-2">{item.label}</span>
                        <span className="mt-0.5 block text-[10px] text-[var(--color-text-3)]">
                          {new Date(item.createdAt).toLocaleString("es-ES", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
