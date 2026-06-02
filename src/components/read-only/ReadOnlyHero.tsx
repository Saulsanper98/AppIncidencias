"use client";

/**
 * ReadOnlyHero — Cabecera grande para la página /lectura.
 *
 * Pensada para que se vea bien en una pantalla del centro de control:
 *   - Icono grande con halo de color.
 *   - Título tipográficamente fuerte + badge "EN VIVO".
 *   - Reloj en vivo con tipografía premium: HH:MM grande, segundos
 *     pequeños y discretos (no compiten con el contenido principal).
 *   - Pie con info contextual (última incidencia, total visible, etc).
 */

import { Activity, Eye } from "lucide-react";
import { useEffect, useState } from "react";

export function ReadOnlyHero({ userName }: { userName: string }) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  const ss = now.getSeconds().toString().padStart(2, "0");
  const dateLong = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-5 sm:px-7 sm:py-6"
      style={{
        background:
          "radial-gradient(ellipse at 8% 50%, rgba(37,99,235,0.18) 0%, transparent 55%), radial-gradient(ellipse at 100% 30%, rgba(220,38,38,0.10) 0%, transparent 50%), linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--color-accent)]/15 blur-3xl"
      />
      {/* Grid de puntos decorativo */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Bloque izquierdo: icono + título */}
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent-light)] ring-1 ring-inset ring-[var(--color-accent)]/40 shadow-lg shadow-[var(--color-accent)]/10 sm:h-[64px] sm:w-[64px]">
            <Eye size={28} className="text-[var(--color-accent)]" strokeWidth={2.2} />
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-surface)] ring-2 ring-[var(--color-surface)]"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" />
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-[var(--color-text-1)] sm:text-[28px]">
                Lectura de incidencias
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                <Activity size={9} className="animate-pulse" />
                En vivo
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--color-text-2)] sm:text-[13.5px]">
              Bandeja de incidencias en tiempo real para{" "}
              <strong className="font-semibold text-[var(--color-text-1)]">
                {userName}
              </strong>
              . Solo consulta: refresca cada 30 segundos y no hay botones de edición.
            </p>
          </div>
        </div>

        {/* Bloque derecho: reloj. HH:MM grande, segundos pequeños y sutiles. */}
        <div className="flex w-full items-center justify-end sm:w-auto">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 px-4 py-2.5 text-right shadow-inner backdrop-blur">
            <div className="flex items-baseline justify-end gap-1">
              <p className="font-mono text-[36px] font-bold leading-none tracking-tight text-[var(--color-text-1)] tabular-nums sm:text-[42px]">
                {hh}
                <span className="mx-0.5 animate-pulse text-[var(--color-accent)]">:</span>
                {mm}
              </p>
              <p className="font-mono text-[13px] font-medium leading-none text-[var(--color-text-3)] tabular-nums">
                :{ss}
              </p>
            </div>
            <p className="mt-1.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-3)]">
              {dateLong}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
