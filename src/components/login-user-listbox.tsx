"use client";

import { ChevronDown } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type Ref,
} from "react";

import { cn } from "@/lib/utils";

export type LoginUserListboxOption = { value: string; label: string };

type LoginUserListboxProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: LoginUserListboxOption[];
  className?: string;
  "aria-describedby"?: string;
};

const triggerBase =
  "login-focusable flex w-full min-h-[44px] items-center justify-between gap-2 rounded-xl border border-[color-mix(in_oklab,var(--color-border)_88%,transparent)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left text-[13px] leading-5 text-[var(--color-text-1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,background-color,box-shadow] duration-150 hover:border-[color-mix(in_oklab,var(--color-border-hover)_70%,var(--color-border))] hover:bg-[color-mix(in_oklab,var(--color-surface-2)_92%,var(--color-surface-3))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--color-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] data-[open=true]:border-[color-mix(in_oklab,var(--color-accent)_32%,var(--color-border))]";

const listSurface =
  "login-user-listbox-panel absolute left-0 right-0 top-full z-50 mt-1.5 flex max-h-[min(280px,50vh)] flex-col gap-0.5 overflow-y-auto rounded-xl border border-[color-mix(in_oklab,var(--color-border)_85%,transparent)] bg-[color-mix(in_oklab,var(--color-surface-2)_96%,var(--color-surface))] p-1.5 shadow-[0_18px_48px_-14px_rgba(0,0,0,0.55)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[color-mix(in_oklab,var(--color-surface-3)_40%,transparent)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_oklab,var(--color-text-3)_35%,transparent)]";

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const r of refs) {
      if (!r) continue;
      if (typeof r === "function") r(node);
      else (r as MutableRefObject<T | null>).current = node;
    }
  };
}

export const LoginUserListbox = forwardRef<HTMLButtonElement, LoginUserListboxProps>(
  function LoginUserListbox({ id, value, onChange, options, className, "aria-describedby": ariaDescribedBy }, ref) {
    const listId = useId();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const openRef = useRef(false);

    openRef.current = open;

    const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

    const focusOption = useCallback((index: number) => {
      const n = options.length;
      if (n === 0) return;
      const i = ((index % n) + n) % n;
      optionRefs.current[i]?.focus();
    }, [options.length]);

    useLayoutEffect(() => {
      if (!open) return;
      const idx = options.findIndex((o) => o.value === value);
      const i = idx >= 0 ? idx : 0;
      requestAnimationFrame(() => optionRefs.current[i]?.focus());
    }, [open, options, value]);

    useEffect(() => {
      const onDocMouse = (e: MouseEvent) => {
        const el = rootRef.current;
        if (el && !el.contains(e.target as Node)) setOpen(false);
      };
      const onDocKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape" || !openRef.current) return;
        setOpen(false);
        triggerRef.current?.focus();
      };
      document.addEventListener("mousedown", onDocMouse);
      document.addEventListener("keydown", onDocKey);
      return () => {
        document.removeEventListener("mousedown", onDocMouse);
        document.removeEventListener("keydown", onDocKey);
      };
    }, []);

    return (
      <div ref={rootRef} className={cn("relative min-w-0", className)}>
        <button
          ref={mergeRefs(ref, triggerRef)}
          id={id}
          type="button"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-describedby={ariaDescribedBy}
          data-open={open}
          className={triggerBase}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (open) {
                e.preventDefault();
                setOpen(false);
              }
              return;
            }
            if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) {
              e.preventDefault();
              setOpen(true);
              return;
            }
            if (!open && e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
          <ChevronDown
            size={18}
            strokeWidth={2}
            className={cn("shrink-0 text-[var(--color-text-3)] transition-transform duration-200", open && "rotate-180")}
            aria-hidden
          />
        </button>

        {open ? (
          <ul id={listId} role="listbox" tabIndex={-1} className={listSurface}>
            {options.map((opt, idx) => {
              const active = opt.value === value;
              return (
                <li key={opt.value} role="presentation" className="min-w-0">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    className={cn(
                      "flex w-full rounded-lg px-3 py-2.5 text-left text-[13px] leading-snug transition-colors duration-150",
                      active
                        ? "bg-[color-mix(in_oklab,var(--color-accent)_22%,var(--color-surface-3))] font-medium text-[var(--color-text-1)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_35%,transparent)]"
                        : "text-[color-mix(in_oklab,var(--color-text-2)_92%,white)] hover:bg-[color-mix(in_oklab,var(--color-surface-3)_70%,transparent)] hover:text-[var(--color-text-1)]",
                    )}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        focusOption(idx + 1);
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        focusOption(idx - 1);
                        return;
                      }
                      if (e.key === "Home") {
                        e.preventDefault();
                        focusOption(0);
                        return;
                      }
                      if (e.key === "End") {
                        e.preventDefault();
                        focusOption(options.length - 1);
                        return;
                      }
                      if (e.key === "Tab") {
                        setOpen(false);
                      }
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
    );
  },
);
