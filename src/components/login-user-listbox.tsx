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

import { resolveAccountImageUrl } from "@/lib/account-media";
import { cn } from "@/lib/utils";

export type LoginUserListboxOption = {
  value: string;
  label: string;
  /** Línea secundaria opcional (puesto o rol). */
  secondary?: string | null;
  /** URL del avatar opcional (acepta GIF animado). */
  avatarUrl?: string | null;
};

type LoginUserListboxProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: LoginUserListboxOption[];
  className?: string;
  "aria-describedby"?: string;
};

function initialsFromLabel(label: string): string {
  return label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function OptionAvatar({ avatarUrl, label, size = 28 }: { avatarUrl?: string | null; label: string; size?: number }) {
  // Normaliza URLs heredadas `/uploads/avatars/...` para servirlas por el
  // route handler dinamico y evitar 404 con archivos subidos en runtime.
  const src = resolveAccountImageUrl(avatarUrl);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden
        className="shrink-0 rounded-full object-cover ring-1 ring-[color-mix(in_oklab,var(--color-border)_70%,transparent)]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-light)_70%,var(--color-surface-3))] text-[10px] font-semibold text-[var(--color-accent)] ring-1 ring-[color-mix(in_oklab,var(--color-border)_70%,transparent)]"
      style={{ width: size, height: size }}
    >
      {initialsFromLabel(label) || "?"}
    </span>
  );
}

const triggerBase =
  "login-focusable login-listbox-trigger-premium flex w-full min-h-[44px] items-center justify-between gap-2 rounded-xl border border-[color-mix(in_oklab,var(--color-border)_88%,transparent)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left text-[13px] leading-5 text-[var(--color-text-1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,background-color,box-shadow] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--color-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]";

const listSurface =
  "login-user-listbox-panel login-listbox-panel-premium absolute left-0 right-0 top-full z-50 mt-1.5 flex max-h-[min(280px,50vh)] flex-col gap-0.5 overflow-y-auto rounded-xl border border-[color-mix(in_oklab,var(--color-border)_85%,transparent)] bg-[color-mix(in_oklab,var(--color-surface-2)_96%,var(--color-surface))] p-1.5 shadow-[0_18px_48px_-14px_rgba(0,0,0,0.55)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[color-mix(in_oklab,var(--color-surface-3)_40%,transparent)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_oklab,var(--color-text-3)_35%,transparent)]";

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

    const selectedOption = options.find((o) => o.value === value);
    const selectedLabel = selectedOption?.label ?? "";
    const hasRichOptions = options.some((opt) => opt.avatarUrl || opt.secondary);

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
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            {hasRichOptions ? (
              <span className="login-avatar-online">
                <OptionAvatar avatarUrl={selectedOption?.avatarUrl ?? null} label={selectedLabel} size={32} />
              </span>
            ) : null}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium text-[var(--color-text-1)]">{selectedLabel}</span>
              {selectedOption?.secondary ? (
                <span className="truncate text-[11px] text-[var(--color-text-3)]">{selectedOption.secondary}</span>
              ) : null}
            </span>
          </span>
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
                      "login-listbox-option flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 pl-3 text-left text-[13px] leading-snug transition-colors duration-150",
                      active
                        ? "login-listbox-option--active bg-[color-mix(in_oklab,var(--color-accent)_22%,var(--color-surface-3))] font-medium text-[var(--color-text-1)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_35%,transparent)]"
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
                    {hasRichOptions ? (
                      <OptionAvatar avatarUrl={opt.avatarUrl ?? null} label={opt.label} size={28} />
                    ) : null}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{opt.label}</span>
                      {opt.secondary ? (
                        <span className="truncate text-[11px] text-[color-mix(in_oklab,var(--color-text-3)_75%,white)]">
                          {opt.secondary}
                        </span>
                      ) : null}
                    </span>
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
