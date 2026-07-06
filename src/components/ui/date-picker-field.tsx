"use client";

import { format, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import "@/components/mapa/map-date-field.css";
import "react-day-picker/style.css";

type Props = {
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  /** Sin etiqueta superior — para barras de filtros y formularios compactos. */
  compact?: boolean;
  label?: string;
  ariaLabel?: string;
  maxDateStr?: string;
  minDateStr?: string;
  placeholder?: string;
};

function parseYmd(s: string): Date | undefined {
  if (!s.trim()) return undefined;
  const d = parseISO(s.trim());
  return isValid(d) ? d : undefined;
}

export function DatePickerField({
  value,
  onChange,
  className,
  compact = false,
  label,
  ariaLabel = "Fecha",
  maxDateStr,
  minDateStr,
  placeholder = "Elegir fecha…",
}: Props) {
  const uid = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const selected = parseYmd(value);
  const minDate = minDateStr ? parseYmd(minDateStr) : undefined;
  const maxDate = maxDateStr ? parseYmd(maxDateStr) : undefined;

  const disabledMatchers = useMemo(() => {
    const m: Matcher[] = [];
    if (minDate) m.push({ before: minDate });
    if (maxDate) m.push({ after: maxDate });
    return m.length ? m : undefined;
  }, [minDate, maxDate]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePanelPosition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const pad = 8;
    const minW = Math.max(r.width, 280);
    let left = r.left;
    if (left + minW > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - minW - pad);
    }
    const estimatedH = 340;
    let top = r.bottom + 6;
    if (top + estimatedH > window.innerHeight - pad && r.top > estimatedH + pad) {
      top = Math.max(pad, r.top - estimatedH - 6);
    }
    setPanelStyle({
      position: "fixed",
      top,
      left,
      width: minW,
      zIndex: 850,
      maxHeight: Math.min(420, window.innerHeight - top - pad),
      overflow: "auto",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePanelPosition();
    const onResize = () => updatePanelPosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
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

  const labelText = value
    ? format(parseISO(value), compact ? "d MMM yyyy" : "d MMM yyyy", { locale: es })
    : placeholder;

  const previewMonth = value
    ? format(parseISO(value), "EEEE d 'de' MMMM yyyy", { locale: es })
    : "Sin fecha seleccionada";

  const popover = (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={uid}
      className="map-date-field-popover map-date-field-popover-portal map-date-field-popover-elevated rounded-xl p-0 shadow-2xl shadow-black/45"
      style={panelStyle}
    >
      <div className="map-date-field-popover__header">
        <div className="map-date-field-popover__header-text">
          <p id={uid} className="map-date-field-popover__title">
            Fecha
          </p>
          <p className="map-date-field-popover__preview capitalize">{previewMonth}</p>
        </div>
      </div>
      <div className="map-date-field-popover__body">
      <DayPicker
        mode="single"
        navLayout="around"
        selected={selected}
        onSelect={(d) => {
          if (!d) {
            onChange("");
            return;
          }
          onChange(format(d, "yyyy-MM-dd"));
          setOpen(false);
        }}
        locale={es}
        disabled={disabledMatchers}
        classNames={{
          root: cn("rdp-root", "map-date-field-rdp"),
          caption_label: cn(
            "rdp-caption_label",
            "text-sm font-semibold capitalize tracking-tight text-[var(--color-text-1)]",
          ),
          weekday: cn("rdp-weekday", "text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-3)]"),
          day: cn("rdp-day", "text-sm text-[var(--color-text-1)]"),
          selected: cn("rdp-selected", "map-date-field-day-selected"),
          today: cn("rdp-today", "map-date-field-day-today"),
          outside: cn("rdp-outside", "text-[var(--color-text-3)] opacity-50"),
          disabled: cn("rdp-disabled", "opacity-35"),
        }}
      />
      </div>
      <div className="map-date-field-popover__footer flex items-center justify-between gap-2">
        <button
          type="button"
          className="map-date-field-popover__action"
          onClick={() => {
            onChange(format(new Date(), "yyyy-MM-dd"));
            setOpen(false);
          }}
        >
          Hoy
        </button>
        <button
          type="button"
          className="map-date-field-popover__action"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
        >
          Quitar
        </button>
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      {!compact && label ? (
        <p className="mb-1 text-label text-[var(--color-text-3)]">{label}</p>
      ) : null}
      <button
        ref={btnRef}
        type="button"
        id={uid}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          compact
            ? "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-left text-[11px] font-medium shadow-sm transition-colors hover:bg-[var(--color-surface-2)]"
            : "flex w-full min-h-10 items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-left text-xs font-medium text-[var(--color-text-1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)] sm:text-[13px]",
          !value && "text-[var(--color-text-3)] font-normal",
          open && "ring-1 ring-[var(--color-accent)]/25",
        )}
      >
        <span className="truncate">{labelText}</span>
        <CalendarIcon size={15} className="shrink-0 text-[var(--color-text-3)]" aria-hidden />
      </button>
      {open && mounted ? createPortal(popover, document.body) : null}
    </div>
  );
}
