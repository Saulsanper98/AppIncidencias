"use client";

import { ChevronDown } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export type MenuSelectOption = { value: string; label: string };

const btnBase =
  "flex w-full min-h-10 items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-left text-sm font-medium text-[var(--color-text-1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]";

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: MenuSelectOption[];
  /** Texto cuando `value` no coincide con ninguna opción o valor vacío con placeholder */
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  "aria-label"?: string;
  disabled?: boolean;
};

export function MenuSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccionar…",
  className,
  buttonClassName,
  "aria-label": ariaLabel,
  disabled,
}: Props) {
  const listId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const match = options.find((o) => o.value === value);
  const showPlaceholder = !match && (value === "" || Boolean(placeholder));
  const buttonLabel = match?.label ?? (showPlaceholder ? placeholder : value);

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const maxPanel = 280;
    let top = r.bottom + 6;
    let maxHeight = Math.min(maxPanel, window.innerHeight - top - pad);
    if (maxHeight < 120 && r.top > pad + 80) {
      maxHeight = Math.min(maxPanel, r.top - pad * 2);
      top = Math.max(pad, r.top - maxHeight - 6);
    }
    const width = Math.max(r.width, 200);
    let left = r.left;
    if (left + width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - width - pad);
    }
    setPanelStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight: Math.max(120, maxHeight),
      zIndex: 800,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, options.length, updatePosition]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
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

  const onKeyButton = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <button
        ref={btnRef}
        type="button"
        id={`${listId}-trigger`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyButton}
        className={cn(btnBase, disabled && "cursor-not-allowed opacity-50", open && "border-[var(--color-accent)]/45 ring-1 ring-[var(--color-accent)]/25", buttonClassName)}
      >
        <span className={cn("min-w-0 flex-1 truncate", showPlaceholder && "text-[var(--color-text-3)] font-normal")}>
          {buttonLabel}
        </span>
        <ChevronDown size={18} className={cn("shrink-0 text-[var(--color-text-3)] transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              id={listId}
              role="listbox"
              aria-labelledby={`${listId}-trigger`}
              className="overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-2xl shadow-black/40"
              style={panelStyle}
            >
              {options.map((opt) => {
                const selected = opt.value === value;
                return (
                  <button
                    key={opt.value === "" ? "__empty__" : opt.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex w-full items-center px-3 py-2.5 text-left text-sm text-[var(--color-text-1)] transition-colors",
                      selected
                        ? "bg-[var(--color-accent)]/20 font-semibold text-[var(--color-text-1)]"
                        : "hover:bg-[var(--color-surface-3)]",
                    )}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
