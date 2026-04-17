"use client";

import { MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type InventoryMoreMenuProps = {
  partCode: string;
  onCopySummary: () => void;
  onExportCsv: () => void;
  align?: "left" | "right";
};

export function InventoryMoreMenu({ partCode, onCopySummary, onExportCsv, align = "right" }: InventoryMoreMenuProps) {
  const domId = useId();
  const menuId = `${domId}-menu`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    itemRefs.current = [];
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDoc);
    const t = window.setTimeout(() => itemRefs.current[0]?.focus(), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, close]);

  const moveFocus = (delta: number) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (!items.length) return;
    const idx = items.findIndex((el) => el === document.activeElement);
    const base = idx === -1 ? 0 : idx;
    const next = (base + delta + items.length) % items.length;
    items[next]?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(1);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-1);
    }
    if (e.key === "Home") {
      e.preventDefault();
      itemRefs.current[0]?.focus();
    }
    if (e.key === "End") {
      e.preventDefault();
      const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
      items[items.length - 1]?.focus();
    }
  };

  return (
    <div ref={rootRef} className="relative print:hidden" data-inv-more-menu={partCode}>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-0 px-2 py-1"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Más acciones para ${partCode}`}
      >
        <MoreHorizontal size={18} aria-hidden />
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute z-30 mt-1 w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg outline-none",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <button
            ref={(el) => {
              itemRefs.current[0] = el;
            }}
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-sm text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)] focus:bg-[var(--color-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
            onClick={() => {
              onCopySummary();
              close();
            }}
          >
            Copiar resumen
          </button>
          <button
            ref={(el) => {
              itemRefs.current[1] = el;
            }}
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-sm text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)] focus:bg-[var(--color-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
            onClick={() => {
              onExportCsv();
              close();
            }}
          >
            Exportar fila CSV
          </button>
        </div>
      ) : null}
    </div>
  );
}
