"use client";

import { format, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarClock, ChevronDown, ChevronUp, Clock3 } from "lucide-react";
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
  /** Formato `yyyy-MM-ddTHH:mm` (compatible con datetime-local). */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
  maxDateStr?: string;
  minDateStr?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function defaultDatetimeLocalValue(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseDatetimeLocal(raw: string): { date: Date; hour: number; minute: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return { date: d, hour: d.getHours(), minute: d.getMinutes() };
}

function parseYmd(s: string): Date | undefined {
  if (!s.trim()) return undefined;
  const d = parseISO(s.trim());
  return isValid(d) ? d : undefined;
}

function buildDatetimeLocal(date: Date, hour: number, minute: number): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}T${pad2(hour)}:${pad2(minute)}`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function TimeColumn({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: number[];
  selected: number;
  onSelect: (value: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const min = values[0] ?? 0;
  const max = values[values.length - 1] ?? 0;

  const nudge = useCallback(
    (delta: number) => {
      let next = selected + delta;
      if (next < min) next = max;
      if (next > max) next = min;
      onSelect(next);
    },
    [max, min, onSelect, selected],
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>('[data-selected="true"]');
    if (!el) return;
    // scrollIntoView({ block: "center" }) también mueve el documento (la
    // página "baja sola" al abrir el popover). Solo ajustamos esta columna.
    const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTop = Math.max(0, top);
  }, [selected]);

  return (
    <div className="datetime-picker-time-col">
      <p className="datetime-picker-time-col__label">{label}</p>
      <button
        type="button"
        className="datetime-picker-time-col__nudge"
        aria-label={`Subir ${label.toLowerCase()}`}
        onClick={() => nudge(-1)}
      >
        <ChevronUp size={14} strokeWidth={2.25} aria-hidden />
      </button>
      <div className="datetime-picker-time-col__scroll-wrap">
        <div
          ref={scrollRef}
          className="datetime-picker-time-col__scroll"
          role="listbox"
          aria-label={label}
          onWheel={(e) => e.stopPropagation()}
        >
          {values.map((v) => {
            const active = v === selected;
            return (
              <button
                key={v}
                type="button"
                role="option"
                data-selected={active ? "true" : undefined}
                aria-selected={active}
                className={cn("datetime-picker-time-col__item", active && "datetime-picker-time-col__item--active")}
                onClick={() => onSelect(v)}
              >
                {pad2(v)}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className="datetime-picker-time-col__nudge"
        aria-label={`Bajar ${label.toLowerCase()}`}
        onClick={() => nudge(1)}
      >
        <ChevronDown size={14} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}

export function DateTimePickerField({
  value,
  onChange,
  id,
  className,
  ariaLabel = "Fecha y hora",
  placeholder = "Elegir fecha y hora…",
  maxDateStr,
  minDateStr,
}: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const parsed = useMemo(() => parseDatetimeLocal(value), [value]);
  const selectedDate = parsed?.date;
  const selectedHour = parsed?.hour ?? 0;
  const selectedMinute = parsed?.minute ?? 0;

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
    const minW = Math.min(Math.max(r.width, 420), 480);
    let left = r.left;
    if (left + minW > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - minW - pad);
    }
    const estimatedH = 400;
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
      maxHeight: Math.min(440, window.innerHeight - top - pad),
      overflow: "hidden",
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

  const patchDatetime = useCallback(
    (patch: { date?: Date; hour?: number; minute?: number }) => {
      const base = parsed?.date ?? new Date();
      const nextDate = patch.date ?? base;
      const nextHour = patch.hour ?? selectedHour;
      const nextMinute = patch.minute ?? selectedMinute;
      onChange(buildDatetimeLocal(nextDate, nextHour, nextMinute));
    },
    [onChange, parsed?.date, selectedHour, selectedMinute],
  );

  const labelText = parsed
    ? format(parsed.date, "d MMM yyyy · HH:mm", { locale: es })
    : placeholder;

  const previewDate = parsed
    ? format(parsed.date, "EEEE d 'de' MMMM", { locale: es })
    : "Sin fecha";
  const previewTime = parsed ? `${pad2(selectedHour)}:${pad2(selectedMinute)}` : "--:--";

  const popover = (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={`${fieldId}-title`}
      className="map-date-field-popover map-date-field-popover-portal datetime-picker-popover map-date-field-popover-elevated rounded-xl p-0 shadow-2xl shadow-black/45"
      style={panelStyle}
    >
      <div className="datetime-picker-popover__header">
        <div className="datetime-picker-popover__header-text">
          <p id={`${fieldId}-title`} className="datetime-picker-popover__title">
            Fecha y hora
          </p>
          <p className="datetime-picker-popover__preview capitalize">{previewDate}</p>
        </div>
        <div className="datetime-picker-popover__time-chip" aria-hidden>
          <Clock3 size={14} strokeWidth={2} />
          <span className="datetime-picker-popover__time-chip-value">{previewTime}</span>
        </div>
      </div>

      <div className="datetime-picker-popover__body">
        <div className="datetime-picker-popover__calendar">
          <DayPicker
            mode="single"
            navLayout="around"
            selected={selectedDate}
            onSelect={(d) => {
              if (!d) return;
              patchDatetime({ date: d });
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
        <div className="datetime-picker-popover__divider" aria-hidden />
        <div className="datetime-picker-popover__time">
          <p className="datetime-picker-popover__time-heading">Hora de la incidencia</p>
          <div className="datetime-picker-popover__time-columns">
            <TimeColumn label="Hora" values={HOURS} selected={selectedHour} onSelect={(hour) => patchDatetime({ hour })} />
            <span className="datetime-picker-popover__colon" aria-hidden>
              :
            </span>
            <TimeColumn
              label="Min"
              values={MINUTES}
              selected={selectedMinute}
              onSelect={(minute) => patchDatetime({ minute })}
            />
          </div>
        </div>
      </div>
      <div className="datetime-picker-popover__footer">
        <div className="datetime-picker-popover__footer-secondary">
          <button
            type="button"
            className="datetime-picker-popover__action"
            onClick={() => {
              onChange(defaultDatetimeLocalValue());
              setOpen(false);
            }}
          >
            Ahora
          </button>
          <button
            type="button"
            className="datetime-picker-popover__action"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Borrar
          </button>
        </div>
        <button
          type="button"
          className="datetime-picker-popover__action datetime-picker-popover__action--primary"
          onClick={() => setOpen(false)}
        >
          Listo
        </button>
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        id={fieldId}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-left text-[13px] font-medium text-[var(--color-text-1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)]",
          !value && "font-normal text-[var(--color-text-3)]",
          open && "ring-1 ring-[var(--color-accent)]/25",
        )}
      >
        <span className="truncate">{labelText}</span>
        <CalendarClock size={16} className="shrink-0 text-[var(--color-text-3)]" aria-hidden />
      </button>
      {open && mounted ? createPortal(popover, document.body) : null}
    </div>
  );
}

function parseTimeHm(raw: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return { hour: 8, minute: 0 };
  const hour = Math.min(23, Math.max(0, Number(m[1])));
  const minute = Math.min(59, Math.max(0, Number(m[2])));
  return { hour, minute };
}

type TimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
};

export function TimePickerField({
  value,
  onChange,
  id,
  className,
  ariaLabel = "Hora",
  placeholder = "Elegir hora…",
}: TimePickerProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const { hour: selectedHour, minute: selectedMinute } = useMemo(() => parseTimeHm(value), [value]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePanelPosition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const pad = 8;
    const minW = Math.max(r.width, 220);
    let left = r.left;
    if (left + minW > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - minW - pad);
    }
    const estimatedH = 360;
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

  const patchTime = useCallback(
    (patch: { hour?: number; minute?: number }) => {
      const hour = patch.hour ?? selectedHour;
      const minute = patch.minute ?? selectedMinute;
      onChange(`${pad2(hour)}:${pad2(minute)}`);
    },
    [onChange, selectedHour, selectedMinute],
  );

  const labelText = value.trim() ? `${pad2(selectedHour)}:${pad2(selectedMinute)}` : placeholder;

  const popover = (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={`${fieldId}-title`}
      className="map-date-field-popover map-date-field-popover-portal datetime-picker-popover datetime-picker-popover--time-only map-date-field-popover-elevated rounded-xl p-0 shadow-2xl shadow-black/45"
      style={panelStyle}
    >
      <div className="datetime-picker-popover__header">
        <div className="datetime-picker-popover__header-text">
          <p id={`${fieldId}-title`} className="datetime-picker-popover__title">
            Hora
          </p>
        </div>
        <div className="datetime-picker-popover__time-chip" aria-hidden>
          <Clock3 size={14} strokeWidth={2} />
          <span className="datetime-picker-popover__time-chip-value">
            {pad2(selectedHour)}:{pad2(selectedMinute)}
          </span>
        </div>
      </div>
      <div className="datetime-picker-popover__time px-4 py-3">
        <div className="datetime-picker-popover__time-columns">
          <TimeColumn label="Hora" values={HOURS} selected={selectedHour} onSelect={(hour) => patchTime({ hour })} />
          <span className="datetime-picker-popover__colon" aria-hidden>
            :
          </span>
          <TimeColumn
            label="Min"
            values={MINUTES}
            selected={selectedMinute}
            onSelect={(minute) => patchTime({ minute })}
          />
        </div>
      </div>
      <div className="datetime-picker-popover__footer">
        <button
          type="button"
          className="datetime-picker-popover__action datetime-picker-popover__action--primary ml-auto"
          onClick={() => setOpen(false)}
        >
          Listo
        </button>
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        id={fieldId}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-left text-[13px] font-medium text-[var(--color-text-1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)]",
          !value && "font-normal text-[var(--color-text-3)]",
          open && "ring-1 ring-[var(--color-accent)]/25",
        )}
      >
        <span className="truncate">{labelText}</span>
        <Clock3 size={16} className="shrink-0 text-[var(--color-text-3)]" aria-hidden />
      </button>
      {open && mounted ? createPortal(popover, document.body) : null}
    </div>
  );
}
