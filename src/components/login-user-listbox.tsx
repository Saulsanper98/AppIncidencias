"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
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

// A partir de cuantos usuarios mostramos el buscador integrado en el
// panel. Por debajo el filtro es ruido visual.
const SEARCH_THRESHOLD = 5;

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
        className="block shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-light)_70%,var(--color-surface-3))] text-[11px] font-semibold text-[var(--color-accent)]"
      style={{ width: size, height: size }}
    >
      {initialsFromLabel(label) || "?"}
    </span>
  );
}

const triggerBase =
  "login-focusable login-listbox-trigger-premium flex w-full min-h-[52px] items-center justify-between gap-2 rounded-xl border border-[color-mix(in_oklab,var(--color-border)_88%,transparent)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left text-[13px] leading-5 text-[var(--color-text-1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,background-color,box-shadow] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--color-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]";

const listSurface =
  "login-user-listbox-panel login-listbox-panel-premium absolute left-0 right-0 top-full z-50 mt-1.5 flex max-h-[min(340px,55vh)] flex-col overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--color-border)_85%,transparent)] bg-[color-mix(in_oklab,var(--color-surface-2)_96%,var(--color-surface))] p-1.5 shadow-[0_18px_48px_-14px_rgba(0,0,0,0.55)]";

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const r of refs) {
      if (!r) continue;
      if (typeof r === "function") r(node);
      else (r as MutableRefObject<T | null>).current = node;
    }
  };
}

function matchesQuery(opt: LoginUserListboxOption, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  if (!needle) return true;
  if (opt.label.toLowerCase().includes(needle)) return true;
  if (opt.secondary && opt.secondary.toLowerCase().includes(needle)) return true;
  return false;
}

export const LoginUserListbox = forwardRef<HTMLButtonElement, LoginUserListboxProps>(
  function LoginUserListbox({ id, value, onChange, options, className, "aria-describedby": ariaDescribedBy }, ref) {
    const listId = useId();
    const searchId = useId();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const openRef = useRef(false);

    openRef.current = open;

    const selectedOption = options.find((o) => o.value === value);
    const selectedLabel = selectedOption?.label ?? "";
    const hasRichOptions = options.some((opt) => opt.avatarUrl || opt.secondary);
    const showSearch = options.length >= SEARCH_THRESHOLD;

    const filteredOptions = useMemo(() => {
      if (!showSearch || !query) return options;
      return options.filter((o) => matchesQuery(o, query));
    }, [options, query, showSearch]);

    const focusOption = useCallback(
      (index: number) => {
        const n = filteredOptions.length;
        if (n === 0) return;
        const i = ((index % n) + n) % n;
        optionRefs.current[i]?.focus();
      },
      [filteredOptions.length],
    );

    useLayoutEffect(() => {
      if (!open) {
        setQuery("");
        return;
      }
      // Si hay buscador, foco al input; si no, al item seleccionado.
      if (showSearch) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return;
      }
      const idx = filteredOptions.findIndex((o) => o.value === value);
      const i = idx >= 0 ? idx : 0;
      requestAnimationFrame(() => optionRefs.current[i]?.focus());
    }, [open, filteredOptions, value, showSearch]);

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
          <span className="flex min-w-0 flex-1 items-center gap-3">
            {hasRichOptions ? (
              <span className="login-listbox-trigger-avatar">
                <OptionAvatar avatarUrl={selectedOption?.avatarUrl ?? null} label={selectedLabel} size={36} />
              </span>
            ) : null}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13.5px] font-semibold text-[var(--color-text-1)]">{selectedLabel}</span>
              {selectedOption?.secondary ? (
                <span className="truncate text-[11.5px] text-[var(--color-text-3)]">{selectedOption.secondary}</span>
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
          <div className={listSurface}>
            {/* Header: cuenta de usuarios disponibles. Refuerza la
             *  sensacion de "panel operativo" y no aporta solo aire. */}
            <div className="login-listbox-header">
              <span className="login-listbox-header-count">
                <span className="login-listbox-header-count-dot" aria-hidden />
                {options.length} {options.length === 1 ? "cuenta" : "cuentas"}
              </span>
              <span className="opacity-70">Selecciona</span>
            </div>

            {/* Buscador solo si hay un n�mero razonable de usuarios. */}
            {showSearch ? (
              <div className="login-listbox-search">
                <Search size={14} aria-hidden className="login-listbox-search-icon" strokeWidth={1.8} />
                <input
                  ref={searchInputRef}
                  id={searchId}
                  type="text"
                  inputMode="search"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Buscar usuario..."
                  className="login-listbox-search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      focusOption(0);
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const first = filteredOptions[0];
                      if (first) {
                        onChange(first.value);
                        setOpen(false);
                        triggerRef.current?.focus();
                      }
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      if (query) {
                        setQuery("");
                      } else {
                        setOpen(false);
                        triggerRef.current?.focus();
                      }
                    }
                  }}
                />
                {query ? (
                  <button
                    type="button"
                    className="login-listbox-search-clear"
                    onClick={() => {
                      setQuery("");
                      searchInputRef.current?.focus();
                    }}
                    aria-label="Limpiar busqueda"
                  >
                    <X size={13} aria-hidden strokeWidth={2} />
                  </button>
                ) : null}
              </div>
            ) : null}

            {filteredOptions.length === 0 ? (
              <div className="login-listbox-empty">No hay coincidencias</div>
            ) : (
              <ul
                id={listId}
                role="listbox"
                tabIndex={-1}
                className="flex flex-col gap-0.5 overflow-y-auto px-0.5 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[color-mix(in_oklab,var(--color-surface-3)_40%,transparent)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_oklab,var(--color-text-3)_35%,transparent)]"
              >
                {filteredOptions.map((opt, idx) => {
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
                          "login-listbox-option login-listbox-option-premium",
                          active && "login-listbox-option-premium--active",
                        )}
                        onClick={() => {
                          onChange(opt.value);
                          setOpen(false);
                          triggerRef.current?.focus();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            focusOption(idx + 1);
                            return;
                          }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            if (idx === 0 && showSearch) {
                              searchInputRef.current?.focus();
                            } else {
                              focusOption(idx - 1);
                            }
                            return;
                          }
                          if (e.key === "Home") {
                            e.preventDefault();
                            focusOption(0);
                            return;
                          }
                          if (e.key === "End") {
                            e.preventDefault();
                            focusOption(filteredOptions.length - 1);
                            return;
                          }
                          if (e.key === "Tab") {
                            setOpen(false);
                          }
                        }}
                      >
                        {hasRichOptions ? (
                          <span className="login-listbox-avatar">
                            <OptionAvatar avatarUrl={opt.avatarUrl ?? null} label={opt.label} size={36} />
                          </span>
                        ) : null}
                        <span className="login-listbox-option-text">
                          <span className="login-listbox-option-name">{opt.label}</span>
                          {opt.secondary ? (
                            <span className="login-listbox-option-role">{opt.secondary}</span>
                          ) : null}
                        </span>
                        {active ? (
                          <span className="login-listbox-option-check" aria-hidden>
                            <Check size={13} strokeWidth={3} />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    );
  },
);
