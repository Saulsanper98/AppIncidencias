"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");
    const onNotifications = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as { unread?: number };
        setCount(Math.max(0, Number(parsed.unread ?? 0)));
      } catch {
        setCount(0);
      }
    };
    source.addEventListener("notifications", onNotifications as EventListener);
    source.onerror = () => {
      setCount(0);
    };
    return () => {
      source.removeEventListener("notifications", onNotifications as EventListener);
      source.close();
    };
  }, []);

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
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-2)] transition-all duration-150 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
      >
        <Bell size={16} />
        {count > 0 ? (
          <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--color-error)] px-1 text-[10px] font-semibold leading-4 text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] max-h-[min(70vh,24rem)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
          role="menu"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <p className="text-xs font-medium text-[var(--color-text-1)]">Notificaciones</p>
            <p className="text-[10px] text-[var(--color-text-3)]">Actividad reciente del sistema</p>
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
