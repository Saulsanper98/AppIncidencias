"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type InventoryListboxOption = { value: string; label: string };

type InventoryListboxProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: InventoryListboxOption[];
  className?: string;
};

const triggerClass =
  "flex w-full min-h-[44px] items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-left text-sm text-[var(--color-text-1)] transition-all duration-150 hover:bg-[var(--color-surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]";

export function InventoryListbox({ label, value, onChange, options, className }: InventoryListboxProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value)?.label ?? value;

  useLayoutEffect(() => {
    if (open) {
      firstOptionRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
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
    <div ref={rootRef} className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span id={`${baseId}-lbl`} className="text-[11px] font-medium text-[var(--color-text-2)]">
        {label}
      </span>
      <div className="relative">
        <button
          type="button"
          role="combobox"
          aria-autocomplete="list"
          className={triggerClass}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${baseId}-lbl`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="min-w-0 truncate">{selected}</span>
          <ChevronDown
            size={16}
            className={cn("shrink-0 text-[var(--color-text-3)] transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={`${baseId}-lbl`}
            className="absolute left-0 right-0 top-full z-40 mt-1 max-h-60 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
          >
            {options.map((opt, idx) => {
              const active = opt.value === value;
              return (
                <li key={opt.value} role="presentation">
                  <button
                    ref={idx === 0 ? firstOptionRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "flex w-full px-3 py-2.5 text-left text-sm transition-colors",
                      active
                        ? "bg-[var(--color-accent-light)] font-medium text-[var(--color-text-1)]"
                        : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]",
                    )}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
