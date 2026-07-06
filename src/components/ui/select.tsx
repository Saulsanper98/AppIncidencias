"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Select custom (combobox) que reemplaza al `<select>` nativo para tener un
 * panel desplegable totalmente estilado (la lista de opciones nativa del SO
 * no se puede temar m?s all? de unos pocos colores). Mantiene una API
 * compatible con `<select>`:
 *
 *   - children `<option>` y `<optgroup>` (se leen igual que en HTML nativo).
 *   - prop `value` controlada.
 *   - prop `onChange` recibe un objeto `{ target: { value } }` para no
 *     romper los handlers existentes (`e.target.value`).
 *   - tambi?n expone `onValueChange(value)` para callers que prefieren la
 *     firma moderna.
 *
 * Accesibilidad:
 *   - role="combobox" + aria-haspopup="listbox" en el trigger.
 *   - role="listbox" en el panel, role="option" en cada item con
 *     `aria-selected` y `aria-disabled` adecuados.
 *   - Teclado: Enter / Space / ? / ? / Alt+? abren el panel.
 *     ? / ? navegan, Home / End saltan a extremos, Enter / Space
 *     confirman, Escape cierra. Tab cierra y deja pasar el focus.
 *   - Typeahead: escribir letras (sin Ctrl) busca la primera opci?n que
 *     empiece por esa cadena (b?fer de 600 ms).
 *
 * Posicionamiento: el panel se renderiza en un portal y se sit?a con
 * coordenadas `fixed`, calculadas a partir del trigger. Se reposiciona
 * en `scroll`/`resize` y se vuelca hacia arriba si no cabe abajo.
 */

type OptionItem = {
  kind: "option";
  value: string;
  label: string;
  disabled?: boolean;
};

type GroupItem = {
  kind: "group";
  label: string;
  options: OptionItem[];
};

type Item = OptionItem | GroupItem;

export type SelectProps = {
  value: string;
  onChange?: (event: { target: { value: string; name?: string } }) => void;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  /** default = formularios; compact = filtros inline */
  size?: "default" | "compact";
  className?: string;
  wrapperClassName?: string;
  panelClassName?: string;
  /** Cabecera opcional dentro del panel (p. ej. nombre del filtro). */
  panelTitle?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  children?: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  title?: string;
};

function childToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childToText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return childToText(props.children);
  }
  return String(node);
}

function parseChildren(children: ReactNode): Item[] {
  const items: Item[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      const props = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
      items.push({
        kind: "option",
        value: String(props.value ?? ""),
        label: childToText(props.children).trim() || String(props.value ?? ""),
        disabled: Boolean(props.disabled),
      });
    } else if (child.type === "optgroup") {
      const props = child.props as { label?: string; children?: ReactNode };
      const inner = parseChildren(props.children).filter((i): i is OptionItem => i.kind === "option");
      items.push({ kind: "group", label: props.label ?? "", options: inner });
    }
  });
  return items;
}

function flattenOptions(items: Item[]): OptionItem[] {
  const flat: OptionItem[] = [];
  for (const i of items) {
    if (i.kind === "option") flat.push(i);
    else flat.push(...i.options);
  }
  return flat;
}

type Anchor = { top: number; left: number; width: number; bottom: number; openUp: boolean };

const PANEL_MAX_HEIGHT = 288; // 18rem
const PANEL_GAP = 6;

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    value,
    onChange,
    onValueChange,
    disabled = false,
    size = "default",
    className,
    wrapperClassName,
    panelClassName,
    panelTitle,
    placeholder,
    id,
    name,
    children,
    title,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
  },
  ref,
) {
  const items = useMemo(() => parseChildren(children), [children]);
  const flat = useMemo(() => flattenOptions(items), [items]);
  const selected = useMemo(() => flat.find((o) => o.value === value), [flat, value]);

  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const searchBufferRef = useRef<string>("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const reactId = useId();
  const triggerId = id ?? `ccmgc-select-${reactId}`;
  const panelId = `${triggerId}-panel`;

  const emitChange = useCallback(
    (next: string) => {
      onValueChange?.(next);
      onChange?.({ target: { value: next, name } });
    },
    [name, onChange, onValueChange],
  );

  const updateAnchor = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
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

  useLayoutEffect(() => {
    if (!open) return;
    updateAnchor();
    const handler = () => updateAnchor();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, updateAnchor]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (focusedIdx < 0) return;
    const node = optionRefs.current[focusedIdx];
    node?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx, open]);

  const handleOpen = useCallback(
    (initialFocus?: "selected" | "first" | "last") => {
      if (disabled) return;
      setOpen(true);
      if (flat.length === 0) {
        setFocusedIdx(-1);
        return;
      }
      if (initialFocus === "last") {
        setFocusedIdx(flat.length - 1);
      } else if (initialFocus === "first") {
        setFocusedIdx(flat.findIndex((o) => !o.disabled));
      } else {
        const idx = flat.findIndex((o) => o.value === value);
        setFocusedIdx(idx >= 0 ? idx : flat.findIndex((o) => !o.disabled));
      }
    },
    [disabled, flat, value],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    setFocusedIdx(-1);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const moveFocus = useCallback(
    (direction: 1 | -1) => {
      if (flat.length === 0) return;
      let next = focusedIdx;
      for (let step = 0; step < flat.length; step++) {
        next = (next + direction + flat.length) % flat.length;
        if (!flat[next]?.disabled) break;
      }
      setFocusedIdx(next);
    },
    [flat, focusedIdx],
  );

  const commitFocused = useCallback(() => {
    if (focusedIdx < 0) return;
    const item = flat[focusedIdx];
    if (!item || item.disabled) return;
    emitChange(item.value);
    handleClose();
  }, [emitChange, flat, focusedIdx, handleClose]);

  const handleTypeahead = useCallback(
    (key: string) => {
      if (flat.length === 0) return;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchBufferRef.current += key.toLowerCase();
      const buffer = searchBufferRef.current;
      const startIdx = Math.max(focusedIdx, 0);
      const ordered = [
        ...flat.slice(startIdx + 1),
        ...flat.slice(0, startIdx + 1),
      ];
      const matchedRel = ordered.findIndex(
        (o) => !o.disabled && o.label.toLowerCase().startsWith(buffer),
      );
      if (matchedRel >= 0) {
        const realIdx = (startIdx + 1 + matchedRel) % flat.length;
        setFocusedIdx(realIdx);
      }
      searchTimerRef.current = setTimeout(() => {
        searchBufferRef.current = "";
      }, 600);
    },
    [flat, focusedIdx],
  );

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const { key } = event;
    if (key === "ArrowDown" || (key === "ArrowDown" && event.altKey)) {
      event.preventDefault();
      if (open) moveFocus(1);
      else handleOpen();
    } else if (key === "ArrowUp") {
      event.preventDefault();
      if (open) moveFocus(-1);
      else handleOpen("last");
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (open) commitFocused();
      else handleOpen();
    } else if (key === "Escape") {
      if (open) {
        event.preventDefault();
        handleClose();
      }
    } else if (key === "Home") {
      if (open) {
        event.preventDefault();
        const firstEnabled = flat.findIndex((o) => !o.disabled);
        if (firstEnabled >= 0) setFocusedIdx(firstEnabled);
      }
    } else if (key === "End") {
      if (open) {
        event.preventDefault();
        for (let i = flat.length - 1; i >= 0; i--) {
          if (!flat[i]?.disabled) {
            setFocusedIdx(i);
            break;
          }
        }
      }
    } else if (key === "Tab") {
      if (open) handleClose();
    } else if (
      key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      if (!open) handleOpen();
      handleTypeahead(key);
    }
  };

  const triggerLabel = selected ? selected.label : placeholder ?? "";
  const isPlaceholder = !selected;

  const panelStyle: CSSProperties | undefined = useMemo(() => {
    if (!anchor) return undefined;
    const minWidth = Math.max(anchor.width, size === "compact" ? 220 : 200);
    if (anchor.openUp) {
      return {
        position: "fixed",
        top: anchor.top - PANEL_GAP,
        left: anchor.left,
        minWidth,
        transform: "translateY(-100%)",
      };
    }
    return {
      position: "fixed",
      top: anchor.bottom + PANEL_GAP,
      left: anchor.left,
      minWidth,
    };
  }, [anchor, size]);

  const isCompact = size === "compact";

  let flatIndex = 0;

  return (
    <div className={cn("relative inline-flex w-full items-stretch", wrapperClassName)}>
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-disabled={disabled || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        title={title}
        disabled={disabled}
        onClick={() => (open ? handleClose() : handleOpen())}
        onKeyDown={handleTriggerKeyDown}
        data-open={open ? "true" : undefined}
        className={cn(
          "group/select ccmgc-input-focus flex w-full items-center justify-between gap-2 text-left font-medium text-[var(--color-text-1)] transition-[border-color,box-shadow,background-color] duration-150 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          isCompact
            ? "ccmgc-select-trigger-compact min-h-7 h-7 rounded-md border-0 bg-transparent px-1.5 py-0 text-[11px] shadow-none hover:bg-[var(--color-surface-3)]/55 focus-visible:!border-0 focus-visible:!shadow-none focus-visible:ring-0 focus-visible:outline-none"
            : "ccmgc-select-trigger rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] min-h-[44px] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
          open &&
            (isCompact
              ? "bg-[var(--color-surface-3)]/70 text-[var(--color-accent)]"
              : "border-[var(--color-accent)]/45 bg-[var(--color-surface-3)] ring-2 ring-[var(--color-accent)]/35"),
          className,
        )}
      >
        <span
          className={cn(
            "min-w-0 truncate",
            isPlaceholder ? "text-[var(--color-text-3)] font-normal" : "text-[var(--color-text-1)]",
            open && isCompact && !isPlaceholder && "text-[var(--color-accent)]",
          )}
        >
          {triggerLabel || (placeholder ?? "")}
          {triggerLabel === "" && !placeholder ? "\u00a0" : ""}
        </span>
        <ChevronDown
          size={isCompact ? 12 : 14}
          strokeWidth={1.8}
          aria-hidden
          className={cn(
            "shrink-0 text-[var(--color-text-3)] transition-transform duration-200 ease-out",
            open && "rotate-180 text-[var(--color-accent)]",
          )}
        />
      </button>

      {/* `<input type="hidden">` para que el valor llegue a forms nativos que lean por `name`. */}
      {name ? <input type="hidden" name={name} value={value} /> : null}

      {open && mounted && anchor
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="listbox"
              tabIndex={-1}
              aria-activedescendant={
                focusedIdx >= 0 && flat[focusedIdx]
                  ? `${triggerId}-opt-${focusedIdx}`
                  : undefined
              }
              style={panelStyle}
              className={cn(
                "ccmgc-select-panel z-[200] overflow-hidden rounded-xl border backdrop-blur-md",
                isCompact && "ccmgc-select-panel--compact",
                panelClassName,
              )}
            >
              {panelTitle ? (
                <div className="ccmgc-select-panel-header">
                  <span>{panelTitle}</span>
                  <span className="ccmgc-select-panel-count">
                    <span className="ccmgc-select-panel-count-dot" aria-hidden />
                    {flat.length}
                  </span>
                </div>
              ) : null}
              <ul
                className={cn(
                  "ccmgc-select-list max-h-[18rem] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]",
                  panelTitle ? "py-1" : "py-1.5",
                )}
              >
                {items.map((item, sectionIdx) => {
                  if (item.kind === "group") {
                    return (
                      <li key={`grp-${sectionIdx}`} role="presentation">
                        <div className="pointer-events-none mt-1 px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-3)]/80">
                          {item.label}
                        </div>
                        <ul role="group" aria-label={item.label}>
                          {item.options.map((opt) => {
                            const idx = flatIndex++;
                            return (
                              <SelectOption
                                key={`${opt.value}-${idx}`}
                                option={opt}
                                idx={idx}
                                triggerId={triggerId}
                                compact={isCompact}
                                isFocused={focusedIdx === idx}
                                isSelected={opt.value === value}
                                onHover={() => setFocusedIdx(idx)}
                                onSelect={() => {
                                  if (opt.disabled) return;
                                  emitChange(opt.value);
                                  handleClose();
                                }}
                                ref={(node) => {
                                  optionRefs.current[idx] = node;
                                }}
                              />
                            );
                          })}
                        </ul>
                      </li>
                    );
                  }
                  const idx = flatIndex++;
                  return (
                    <SelectOption
                      key={`${item.value}-${idx}`}
                      option={item}
                      idx={idx}
                      triggerId={triggerId}
                      compact={isCompact}
                      isFocused={focusedIdx === idx}
                      isSelected={item.value === value}
                      onHover={() => setFocusedIdx(idx)}
                      onSelect={() => {
                        if (item.disabled) return;
                        emitChange(item.value);
                        handleClose();
                      }}
                      ref={(node) => {
                        optionRefs.current[idx] = node;
                      }}
                    />
                  );
                })}
                {flat.length === 0 ? (
                  <li
                    role="option"
                    aria-selected={false}
                    aria-disabled
                    className="cursor-default px-3 py-2 text-xs text-[var(--color-text-3)]"
                  >
                    Sin opciones disponibles
                  </li>
                ) : null}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});

type SelectOptionProps = {
  option: OptionItem;
  idx: number;
  triggerId: string;
  compact?: boolean;
  isFocused: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
};

const SelectOption = forwardRef<HTMLLIElement, SelectOptionProps>(function SelectOption(
  { option, idx, triggerId, compact, isFocused, isSelected, onSelect, onHover },
  ref,
) {
  return (
    <li
      ref={ref}
      id={`${triggerId}-opt-${idx}`}
      role="option"
      aria-selected={isSelected}
      aria-disabled={option.disabled || undefined}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect();
      }}
      onMouseEnter={onHover}
      className={cn(
        "ccmgc-select-option",
        compact && "ccmgc-select-option--compact",
        isSelected && "ccmgc-select-option--selected",
        isFocused && !isSelected && "ccmgc-select-option--focused",
        option.disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <span
        className={cn(
          "ccmgc-select-check",
          isSelected && "ccmgc-select-check--on",
        )}
        aria-hidden
      >
        <Check size={compact ? 10 : 11} strokeWidth={2.5} />
      </span>
      <span className="ccmgc-select-option-label">{option.label}</span>
    </li>
  );
});
