"use client";

import { Bell, Check } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSseEvent } from "@/hooks/use-sse-event";

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
  const rootRef = useRef<HTMLDivElement>(null);

  useSseEvent("notifications", (event) => {
    try {
      const parsed = JSON.parse(event.data) as { unread?: number };
      setCount(Math.max(0, Number(parsed.unread ?? 0)));
    } catch {
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
        // Vaciamos en local de inmediato; el SSE confirmará en el siguiente tick.
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
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={
          // Cuando va integrado en el grupo de utilidades del header no
          // necesita borde propio; con padding y radius locales basta.
          "relative inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-[var(--color-text-2)] transition-all duration-150 hover:bg-[var(--color-surface)]/60 hover:text-[var(--color-text-1)]" +
          (open ? " bg-[var(--color-surface)]/60 text-[var(--color-text-1)]" : "")
        }
      >
        <Bell size={15} strokeWidth={1.6} />
        {count > 0 ? (
          <span className="inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-[var(--color-error)] px-1 text-[10px] font-semibold leading-4 text-white shadow-[0_0_0_2px_var(--color-surface)]">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] max-h-[min(70vh,24rem)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
          role="menu"
        >
          <div className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--color-text-1)]">Notificaciones</p>
              <p className="text-[10px] text-[var(--color-text-3)]">Actividad reciente del sistema</p>
            </div>
            <button
              type="button"
              onClick={() => void clearAll()}
              disabled={clearing || (items.length === 0 && count === 0)}
              title="Marcar como leídas todas las notificaciones actuales"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1 text-[10.5px] font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check size={11} aria-hidden />
              {clearing ? "Limpiando…" : "Limpiar"}
            </button>
          </div>
          <div className="max-h-[min(60vh,20rem)] overflow-y-auto">
            {loadingList ? (
              <p className="px-3 py-4 text-center text-xs text-[var(--color-text-3)]">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-[var(--color-text-3)]">No hay elementos recientes</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2.5 text-left text-sm text-[var(--color-text-1)] transition-colors hover:bg-[var(--color-surface-2)]"
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
      ) : null}
    </div>
  );
}
