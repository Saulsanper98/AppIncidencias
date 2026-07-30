"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { TicketTemplate } from "@/components/tickets/TicketTemplatePicker";
import { isGroupTicketTemplateScope, ticketTemplateScopeLabel } from "@/lib/ticket-templates";
import { cn } from "@/lib/utils";

import "./ticket-templates.css";

type Props = {
  templates: TicketTemplate[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  /** Una sola línea, altura de input del formulario. */
  compact?: boolean;
  "aria-label"?: string;
};

function templateMeta(tpl: TicketTemplate): string {
  const tipologia = [tpl.tipo, tpl.subtipo].filter(Boolean).join(" · ");
  if (tipologia) return tipologia;
  if (tpl.category) return tpl.category;
  return "";
}

function groupTemplates(templates: TicketTemplate[]) {
  const byKey = new Map<string, { key: string; label: string; items: TicketTemplate[] }>();
  for (const t of templates) {
    const scopeLabel = ticketTemplateScopeLabel(t.scope);
    const key = `${t.scope}::${t.category ?? "—"}`;
    const label = `${scopeLabel}${t.category ? ` · ${t.category}` : ""}`;
    if (!byKey.has(key)) byKey.set(key, { key, label, items: [] });
    byKey.get(key)!.items.push(t);
  }
  const order = (scope: string) => (scope === "personal" ? 1 : 0);
  return Array.from(byKey.values()).sort((a, b) => {
    const scopeA = a.key.split("::")[0] ?? "";
    const scopeB = b.key.split("::")[0] ?? "";
    return order(scopeA) - order(scopeB) || a.label.localeCompare(b.label, "es");
  });
}

/** Desplegable agrupado para elegir plantillas (ticket rápido, etc.). */
export function TemplateDropdown({
  templates,
  value,
  onChange,
  placeholder = "Elegir plantilla",
  loading = false,
  disabled = false,
  className,
  compact = false,
  "aria-label": ariaLabel,
}: Props) {
  const listId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const selected = templates.find((t) => t.id === value) ?? null;
  const groups = groupTemplates(templates);

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const maxPanel = 320;
    let top = r.bottom + 6;
    let maxHeight = Math.min(maxPanel, window.innerHeight - top - pad);
    if (maxHeight < 140 && r.top > pad + 100) {
      maxHeight = Math.min(maxPanel, r.top - pad * 2);
      top = Math.max(pad, r.top - maxHeight - 6);
    }
    const width = Math.max(r.width, 260);
    let left = r.left;
    if (left + width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - width - pad);
    }
    setPanelStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight: Math.max(140, maxHeight),
      zIndex: 900,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, templates.length, updatePosition]);

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

  const isDisabled = disabled || loading;

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <button
        ref={btnRef}
        type="button"
        id={`${listId}-trigger`}
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel ?? "Plantilla"}
        onClick={() => !isDisabled && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isDisabled) setOpen(true);
          }
        }}
        className={cn(
          "ccmgc-template-dropdown-trigger",
          compact && "ccmgc-template-dropdown-trigger--compact",
          open && "ccmgc-template-dropdown-trigger--open",
          isDisabled && "opacity-60",
        )}
      >
        <span className="min-w-0 flex-1 text-left">
          {loading ? (
            <span className="flex items-center gap-2 text-[var(--color-text-3)]">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Cargando…
            </span>
          ) : selected ? (
            compact ? (
              <span className="block truncate text-[13px] font-medium text-[var(--color-text-1)]">
                {selected.name}
                {templateMeta(selected) ? (
                  <span className="font-normal text-[var(--color-text-3)]"> · {templateMeta(selected)}</span>
                ) : null}
              </span>
            ) : (
              <>
                <span className="block truncate text-sm font-medium text-[var(--color-text-1)]">{selected.name}</span>
                {templateMeta(selected) ? (
                  <span className="block truncate text-[11px] text-[var(--color-text-3)]">{templateMeta(selected)}</span>
                ) : null}
              </>
            )
          ) : (
            <span className={cn("block truncate text-[var(--color-text-3)]", compact ? "text-[13px]" : "text-sm")}>
              {placeholder}
            </span>
          )}
        </span>
        <ChevronDown
          size={compact ? 15 : 18}
          className={cn("shrink-0 text-[var(--color-text-3)] transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {mounted && open && !loading
        ? createPortal(
            <div
              ref={panelRef}
              id={listId}
              role="listbox"
              aria-labelledby={`${listId}-trigger`}
              className="ccmgc-template-dropdown-panel"
              style={panelStyle}
            >
              {groups.length === 0 ? (
                <p className="px-3 py-2.5 text-[12px] text-[var(--color-text-3)]">No hay plantillas disponibles.</p>
              ) : (
                groups.map((group) => (
                  <div key={group.key} className="ccmgc-template-dropdown-group">
                    <p className="ccmgc-template-dropdown-group__label">{group.label}</p>
                    {group.items.map((tpl) => {
                      const isSelected = tpl.id === value;
                      const isTeam = isGroupTicketTemplateScope(tpl.scope);
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={cn(
                            "ccmgc-template-dropdown-option",
                            isSelected && "ccmgc-template-dropdown-option--selected",
                          )}
                          onClick={() => {
                            onChange(tpl.id);
                            setOpen(false);
                          }}
                        >
                          <span className="ccmgc-template-dropdown-option__row">
                            <span
                              className={cn(
                                "ccmgc-template-card__scope",
                                isTeam ? "ccmgc-template-card__scope--team" : "ccmgc-template-card__scope--personal",
                              )}
                            >
                              {isTeam ? "Equipo" : "Personal"}
                            </span>
                            <span className="ccmgc-template-dropdown-option__name">{tpl.name}</span>
                          </span>
                          {templateMeta(tpl) ? (
                            <span className="ccmgc-template-dropdown-option__meta">{templateMeta(tpl)}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
