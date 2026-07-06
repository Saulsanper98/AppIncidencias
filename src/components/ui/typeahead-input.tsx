"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export type TypeaheadOption = {
  value: string;
  /** Texto principal en la lista; por defecto `value`. */
  label?: string;
  /** Texto secundario (operador, municipio, etc.). */
  hint?: string;
};

function optionLabel(option: TypeaheadOption) {
  return option.label ?? option.value;
}

type TypeaheadInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "list"> & {
  value: string;
  onValueChange: (value: string) => void;
  options: TypeaheadOption[];
  /** Máximo de sugerencias visibles (filtradas por lo tecleado). */
  maxSuggestions?: number;
  /** Abrir panel al enfocar aunque el campo esté vacío. */
  openOnFocus?: boolean;
  emptyMessage?: string;
  /** Variante visual del panel y las opciones. */
  variant?: "default" | "tipologia";
  /** Título del panel de sugerencias. */
  listTitle?: string;
};

type Anchor = { top: number; left: number; width: number; bottom: number; openUp: boolean };

const PANEL_MAX_HEIGHT = 240;
const PANEL_GAP = 6;
const DEFAULT_MAX_SUGGESTIONS = 20;

function normalizeQuery(q: string) {
  return q.trim().toLowerCase();
}

function rankOption(option: TypeaheadOption, query: string): number | null {
  if (!query) return 0;
  const label = optionLabel(option).toLowerCase();
  const value = option.value.toLowerCase();
  const hint = (option.hint ?? "").toLowerCase();
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (hint.startsWith(query)) return 2;
  if (label.includes(query)) return 3;
  if (hint.includes(query)) return 4;
  if (value.includes(query)) return 5;
  return null;
}

export const TypeaheadInput = forwardRef<HTMLInputElement, TypeaheadInputProps>(function TypeaheadInput(
  {
    value,
    onValueChange,
    options,
    maxSuggestions = DEFAULT_MAX_SUGGESTIONS,
    openOnFocus = false,
    emptyMessage = "Sin coincidencias",
    variant = "default",
    listTitle = "Sugerencias",
    className,
    onFocus,
    onBlur,
    onKeyDown,
    ...props
  },
  ref,
) {
  const reactId = useId();
  const listId = `${reactId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [mounted, setMounted] = useState(false);

  const setRefs = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  const filtered = useMemo(() => {
    const query = normalizeQuery(value);
    if (!query && !openOnFocus) return [];
    return options
      .map((option) => ({ option, rank: rankOption(option, query) }))
      .filter((item): item is { option: TypeaheadOption; rank: number } => item.rank !== null)
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return optionLabel(a.option).localeCompare(optionLabel(b.option), "es");
      })
      .slice(0, maxSuggestions)
      .map((item) => item.option);
  }, [options, value, maxSuggestions, openOnFocus]);

  const showPanel = open && (filtered.length > 0 || normalizeQuery(value).length > 0);

  const updateAnchor = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < PANEL_MAX_HEIGHT + PANEL_GAP && spaceAbove > spaceBelow;
    setAnchor({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!showPanel) {
      setAnchor(null);
      return;
    }
    updateAnchor();
    const handler = () => updateAnchor();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [showPanel, updateAnchor, filtered.length]);

  useEffect(() => {
    if (!showPanel) return;
    const onDocMouse = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouse);
    return () => document.removeEventListener("mousedown", onDocMouse);
  }, [showPanel]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value, filtered.length]);

  const pick = (next: string) => {
    onValueChange(next);
    setOpen(false);
    inputRef.current?.focus();
  };

  const panelStyle: CSSProperties | undefined = useMemo(() => {
    if (!anchor) return undefined;
    if (anchor.openUp) {
      return {
        position: "fixed",
        top: anchor.top - PANEL_GAP,
        left: anchor.left,
        width: anchor.width,
        maxHeight: PANEL_MAX_HEIGHT,
        transform: "translateY(-100%)",
      };
    }
    return {
      position: "fixed",
      top: anchor.bottom + PANEL_GAP,
      left: anchor.left,
      width: anchor.width,
      maxHeight: PANEL_MAX_HEIGHT,
    };
  }, [anchor]);

  const panel =
    showPanel && mounted && anchor ? (
      <div
        ref={panelRef}
        style={panelStyle}
        className="ccmgc-select-panel z-[200] overflow-hidden rounded-xl border backdrop-blur-md"
        data-typeahead-variant={variant}
      >
        {filtered.length > 0 ? (
          <div className="ccmgc-select-panel-header">
            <span>{listTitle}</span>
            <span className="ccmgc-select-panel-count">
              <span className="ccmgc-select-panel-count-dot" aria-hidden />
              {filtered.length}
            </span>
          </div>
        ) : null}
        <ul
          id={listId}
          role="listbox"
          className="ccmgc-select-list max-h-[min(15rem,var(--typeahead-list-max,15rem))] overflow-y-auto overscroll-contain py-1 [-webkit-overflow-scrolling:touch]"
          style={{ ["--typeahead-list-max" as string]: `${PANEL_MAX_HEIGHT - (filtered.length > 0 ? 36 : 0)}px` }}
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-[12px] text-[var(--color-text-3)]">{emptyMessage}</li>
          ) : (
            filtered.map((option, idx) => {
              const isMatch = option.value === value;
              const isFocused = idx === activeIndex;
              return (
                <li key={`${option.value}-${idx}`} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isMatch}
                    className={cn(
                      "ccmgc-typeahead-option",
                      variant === "tipologia" && "ccmgc-typeahead-option--tipologia",
                      isFocused && "ccmgc-typeahead-option--focused",
                      isMatch && "ccmgc-typeahead-option--match",
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => pick(option.value)}
                  >
                    <span className="ccmgc-typeahead-option-value">{optionLabel(option)}</span>
                    {option.hint ? <span className="ccmgc-typeahead-option-hint">{option.hint}</span> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative w-full">
      <input
        ref={setRefs}
        {...props}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls={showPanel ? listId : undefined}
        className={cn(
          "ccmgc-input-focus w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm text-[var(--color-text-1)] min-h-[44px] transition-all duration-150 placeholder:text-[var(--color-text-3)] focus:outline-none focus-visible:ring-0 [color-scheme:dark]",
          className,
        )}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown" && filtered.length > 0) {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            return;
          }
          if (e.key === "ArrowUp" && filtered.length > 0) {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === "Enter" && open && activeIndex >= 0 && filtered[activeIndex]) {
            e.preventDefault();
            pick(filtered[activeIndex].value);
            return;
          }
          onKeyDown?.(e);
        }}
      />

      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
});
