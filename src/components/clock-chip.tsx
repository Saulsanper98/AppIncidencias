"use client";

/**
 * Chip de reloj en el header. Muestra la hora del navegador formateada con
 * la zona horaria del centro de control (Atlantic/Canary). Tooltip con la
 * fecha completa.
 *
 * Actualiza cada minuto (no segundo: ahorra renders y es suficiente).
 */

import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const TZ = "Atlantic/Canary";

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(date);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(date);
}

function msUntilNextMinute(): number {
  const now = new Date();
  return (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50;
}

export function ClockChip() {
  // Inicializamos en "" para evitar mismatch SSR vs cliente (la hora del
  // servidor casi nunca coincide con la del navegador).
  const [now, setNow] = useState<Date | null>(null);
  const [minuteFading, setMinuteFading] = useState(false);
  const prevMinuteRef = useRef<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const next = new Date();
      const minute = formatTime(next);
      if (prevMinuteRef.current !== null && prevMinuteRef.current !== minute) {
        setMinuteFading(true);
        window.setTimeout(() => setMinuteFading(false), 220);
      }
      prevMinuteRef.current = minute;
      setNow(next);
    };

    tick();
    let intervalId = window.setInterval(tick, 60_000);
    const alignId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      tick();
      intervalId = window.setInterval(tick, 60_000);
    }, msUntilNextMinute());

    return () => {
      window.clearTimeout(alignId);
      window.clearInterval(intervalId);
    };
  }, []);

  if (!now) {
    return (
      <span
        aria-hidden
        className="hidden h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-[var(--color-text-3)] sm:inline-flex"
      >
        <Clock size={13} strokeWidth={1.6} />
        <span className="num-tabular">--:--</span>
      </span>
    );
  }

  const label = `${formatDate(now)} - ${formatTime(now)} (Canarias)`;
  return (
    <span
      title={label}
      aria-label={label}
      className="hidden h-8 items-center gap-1.5 rounded-lg px-2 text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)]/70 sm:inline-flex"
    >
      <Clock size={13} strokeWidth={1.6} className="text-[var(--color-accent)]/80" />
      <span
        className={cn(
          "num-tabular text-[12.5px] font-semibold leading-none tracking-wide text-[var(--color-text-1)] transition-opacity duration-200",
          minuteFading && "clock-minute-tick opacity-40",
        )}
      >
        {formatTime(now)}
      </span>
    </span>
  );
}
