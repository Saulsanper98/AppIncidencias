"use client";

/**
 * InlineCalendar — calendario mensual ligero, reutilizable, sin dependencias.
 *
 * Diseño:
 *  - Semana empieza en LUNES (convención ES).
 *  - Mes navegable con flechas y botón "Hoy".
 *  - Soporta `maxIso` para bloquear fechas futuras (informes diarios) o
 *    permitirlas (planificación preventiva).
 *  - Soporta `dotsMap`: { "YYYY-MM-DD": number } para marcar días con
 *    contenido (puntito de color + tooltip).
 *  - Soporta `dotColor` para personalizar el color del puntito.
 *  - Soporta `onMonthChange(ym)` para que el padre cargue datos del mes.
 *
 * Se usa, por ejemplo, en:
 *  - DailyReportButton (informes ya generados → puntitos ámbar).
 *  - Preventivo (cargas del mes → puntitos del color del activo).
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export type InlineCalendarProps = {
  /** Fecha actualmente seleccionada (YYYY-MM-DD). */
  value: string;
  /** Devuelve la nueva fecha seleccionada (YYYY-MM-DD). */
  onChange: (iso: string) => void;
  /** Fecha máxima seleccionable (YYYY-MM-DD). Por defecto = hoy. */
  maxIso?: string;
  /** Si es true, permite seleccionar cualquier fecha futura (ignora maxIso). */
  allowFuture?: boolean;
  /** Mapa { iso → cantidad } para mostrar un puntito con tooltip. */
  dotsMap?: Record<string, number>;
  /** Tono del puntito ("amber" | "accent" | "success" | etc.). */
  dotColor?: "amber" | "accent" | "success" | "error" | "violet";
  /** Aviso al padre cuando cambia el mes visible (útil para cargar datos). */
  onMonthChange?: (ym: string) => void;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DOT_TONES: Record<NonNullable<InlineCalendarProps["dotColor"]>, string> = {
  amber: "bg-amber-400/90",
  accent: "bg-[var(--color-accent)]",
  success: "bg-[var(--color-success)]",
  error: "bg-[var(--color-error)]",
  violet: "bg-violet-400",
};

export function InlineCalendar({
  value,
  onChange,
  maxIso,
  allowFuture = false,
  dotsMap,
  dotColor = "amber",
  onMonthChange,
}: InlineCalendarProps) {
  const safeValue = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayIso();
  const [viewYM, setViewYM] = useState<string>(() => safeValue.slice(0, 7));

  useEffect(() => {
    setViewYM(safeValue.slice(0, 7));
  }, [safeValue]);

  useEffect(() => {
    onMonthChange?.(viewYM);
  }, [viewYM, onMonthChange]);

  const [yearStr, monthStr] = viewYM.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const monthLabel = useMemo(() => {
    const d = new Date(year, month, 1);
    return d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  }, [year, month]);

  const todayKey = todayIso();
  const maxKey = allowFuture ? "9999-12-31" : (maxIso ?? todayKey);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);
    const out: Array<{ iso: string; day: number; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ iso, day: d.getDate(), inMonth: d.getMonth() === month });
    }
    return out;
  }, [year, month]);

  const canGoNext = useMemo(() => {
    if (allowFuture) return true;
    const nextFirst = new Date(year, month + 1, 1);
    const iso = `${nextFirst.getFullYear()}-${String(nextFirst.getMonth() + 1).padStart(2, "0")}-${String(nextFirst.getDate()).padStart(2, "0")}`;
    return iso <= maxKey;
  }, [year, month, maxKey, allowFuture]);

  const goPrev = useCallback(() => {
    const d = new Date(year, month - 1, 1);
    setViewYM(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }, [year, month]);
  const goNext = useCallback(() => {
    if (!canGoNext) return;
    const d = new Date(year, month + 1, 1);
    setViewYM(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }, [year, month, canGoNext]);
  const goToday = useCallback(() => {
    const t = todayIso();
    setViewYM(t.slice(0, 7));
    onChange(t);
  }, [onChange]);

  const weekDays = ["L", "M", "X", "J", "V", "S", "D"];
  const dotCls = DOT_TONES[dotColor];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-2">
      <header className="mb-2 flex items-center justify-between gap-1 px-1">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Mes anterior"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
        <span className="text-[12px] font-semibold capitalize tracking-tight text-[var(--color-text-1)]">
          {monthLabel}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={goToday}
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
            title="Volver a hoy"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            aria-label="Mes siguiente"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={14} aria-hidden />
          </button>
        </div>
      </header>

      <div className="mb-1 grid grid-cols-7 gap-0.5 px-0.5">
        {weekDays.map((d, i) => (
          <span
            key={d + i}
            className={cn(
              "text-center text-[10px] font-semibold uppercase tracking-wider",
              i >= 5 ? "text-[var(--color-text-3)]/60" : "text-[var(--color-text-3)]",
            )}
          >
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c) => {
          const isFuture = !allowFuture && c.iso > maxKey;
          const isSelected = c.iso === safeValue;
          const isToday = c.iso === todayKey;
          const dow = new Date(c.iso + "T00:00:00").getDay();
          const isWeekend = dow === 0 || dow === 6;
          const dots = dotsMap?.[c.iso] ?? 0;

          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => !isFuture && onChange(c.iso)}
              disabled={isFuture}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              title={dots > 0 ? `${dots} elemento${dots === 1 ? "" : "s"} este día` : undefined}
              className={cn(
                "relative flex h-7 items-center justify-center rounded-md text-[12px] tabular-nums transition-all",
                !c.inMonth && "text-[var(--color-text-3)]/35",
                c.inMonth && !isSelected && !isFuture && "text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]",
                c.inMonth && isWeekend && !isSelected && "text-[var(--color-text-3)]",
                isToday && !isSelected && "ring-1 ring-inset ring-[var(--color-accent)]/60 text-[var(--color-text-1)] font-semibold",
                isSelected && "bg-[var(--color-accent)] text-white font-semibold shadow-sm",
                isFuture && "cursor-not-allowed opacity-30",
              )}
            >
              {c.day}
              {dots > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                    isSelected ? "bg-white/90" : dotCls,
                  )}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
