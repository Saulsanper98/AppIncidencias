"use client";

/**
 * Chip de reloj en el header. Muestra la hora del navegador formateada con
 * la zona horaria del centro de control (Atlantic/Canary). Tooltip con la
 * fecha completa.
 *
 * Actualiza cada minuto (no segundo: ahorra renders y es suficiente).
 */

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

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

export function ClockChip() {
  // Inicializamos en "" para evitar mismatch SSR vs cliente (la hora del
  // servidor casi nunca coincide con la del navegador).
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!now) {
    return (
      <span
        aria-hidden
        className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-[var(--color-text-3)] sm:inline-flex"
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
      className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface)]/60 sm:inline-flex"
    >
      <Clock size={13} strokeWidth={1.6} className="text-[var(--color-accent)]/80" />
      <span className="num-tabular text-[12.5px] font-semibold leading-none tracking-wide text-[var(--color-text-1)]">
        {formatTime(now)}
      </span>
    </span>
  );
}
