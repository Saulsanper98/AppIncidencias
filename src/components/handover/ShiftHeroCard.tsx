"use client";

import { ArrowRight, Moon, Sunrise, Sunset } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Hero "Turno en curso" para la pagina de Pase de turno.
 *
 *  - Detecta el turno activo en base a la hora local (M 6-14, T 14-22, N 22-6).
 *  - Muestra un icono grande con gradient distintivo del turno.
 *  - Indica hora de inicio/fin y un mini progreso (% completado) del turno.
 *  - Indica cuanto queda para cerrar el turno o cuanto lleva el siguiente.
 *  - Sub-pill con "Siguiente: <T> 14:00 (en 2h 18m)".
 *  - Auto-refresh cada 60s para mantener el progreso vivo.
 */

type ShiftKey = "M" | "T" | "N";

type ShiftMeta = {
  key: ShiftKey;
  label: string;
  startHour: number; // 0-23 (UTC local del servidor/cliente; misma TZ por convencion).
  endHour: number; // exclusivo
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** Clases para el fondo del icono + halo + barra de progreso. */
  toneBg: string;
  toneBorder: string;
  toneText: string;
  toneBar: string; // gradient para la barra
  toneGlow: string;
  toneChip: string;
};

const SHIFTS: ShiftMeta[] = [
  {
    key: "M",
    label: "Mañana",
    startHour: 6,
    endHour: 14,
    Icon: Sunrise,
    toneBg: "from-amber-400/25 to-yellow-500/10",
    toneBorder: "border-amber-400/40",
    toneText: "text-amber-200",
    toneBar: "from-amber-400 via-orange-400 to-yellow-300",
    toneGlow: "bg-amber-400/20",
    toneChip: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  },
  {
    key: "T",
    label: "Tarde",
    startHour: 14,
    endHour: 22,
    Icon: Sunset,
    toneBg: "from-orange-500/25 to-rose-500/10",
    toneBorder: "border-orange-400/40",
    toneText: "text-orange-200",
    toneBar: "from-orange-400 via-rose-400 to-pink-300",
    toneGlow: "bg-orange-500/20",
    toneChip: "bg-orange-500/15 text-orange-200 border-orange-400/30",
  },
  {
    key: "N",
    label: "Noche",
    startHour: 22,
    endHour: 6, // cruza medianoche
    Icon: Moon,
    toneBg: "from-indigo-500/25 to-violet-600/10",
    toneBorder: "border-indigo-400/40",
    toneText: "text-indigo-200",
    toneBar: "from-indigo-400 via-violet-400 to-sky-300",
    toneGlow: "bg-indigo-500/20",
    toneChip: "bg-indigo-500/15 text-indigo-200 border-indigo-400/30",
  },
];

function metaForHour(hour: number): ShiftMeta {
  if (hour >= 6 && hour < 14) return SHIFTS[0];
  if (hour >= 14 && hour < 22) return SHIFTS[1];
  return SHIFTS[2];
}

function nextShift(current: ShiftMeta): ShiftMeta {
  if (current.key === "M") return SHIFTS[1];
  if (current.key === "T") return SHIFTS[2];
  return SHIFTS[0];
}

/** Devuelve un Date de hoy a la hora indicada. Si la hora ya pasó, suma un día. */
function nextDateAtHour(reference: Date, hour: number): Date {
  const d = new Date(reference);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= reference.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

function formatHm(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export function ShiftHeroCard({
  unackedCount = 0,
  authorOfLastHandover = null,
}: {
  unackedCount?: number;
  authorOfLastHandover?: string | null;
}) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const current = useMemo(() => metaForHour(now.getHours()), [now]);
  const next = useMemo(() => nextShift(current), [current]);

  const { progress, remainingMs, elapsedMs, startAt, endAt, nextStartAt } = useMemo(() => {
    // Inicio del turno actual (puede ser ayer en el caso de la Noche entre 0-6).
    const start = new Date(now);
    if (current.key === "N") {
      if (now.getHours() < 6) {
        // Estamos entre las 00:00 y las 06:00: el turno empezó ayer a las 22:00.
        start.setDate(start.getDate() - 1);
        start.setHours(22, 0, 0, 0);
      } else {
        // Estamos entre las 22:00 y las 23:59: el turno empezó hoy a las 22:00.
        start.setHours(22, 0, 0, 0);
      }
    } else {
      start.setHours(current.startHour, 0, 0, 0);
    }

    // Final del turno actual.
    const end = new Date(start);
    if (current.key === "N") end.setHours(start.getHours() + 8); // suma 8h (22→06)
    else end.setHours(current.endHour, 0, 0, 0);

    const totalMs = end.getTime() - start.getTime();
    const elapsed = Math.max(0, now.getTime() - start.getTime());
    const remaining = Math.max(0, end.getTime() - now.getTime());
    const pct = totalMs > 0 ? Math.min(100, Math.round((elapsed / totalMs) * 100)) : 0;

    const nextStart = nextDateAtHour(now, next.startHour);
    return {
      progress: pct,
      remainingMs: remaining,
      elapsedMs: elapsed,
      startAt: start,
      endAt: end,
      nextStartAt: nextStart,
    };
  }, [now, current, next]);

  const Icon = current.Icon;
  const NextIcon = next.Icon;
  const todayHuman = useMemo(
    () => now.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long" }),
    [now],
  );

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-sm sm:p-5",
        current.toneBorder,
        current.toneBg,
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl",
          current.toneGlow,
        )}
      />

      <div className="relative grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
        {/* Icono grande del turno */}
        <div
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface)]/40 ring-1 backdrop-blur-sm",
            current.toneBorder,
          )}
        >
          <Icon size={32} className={current.toneText} aria-hidden />
        </div>

        {/* Bloque principal */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[10.5px] uppercase tracking-widest text-[var(--color-text-3)]">
            <span className={cn("rounded-full border px-2 py-0.5 font-semibold", current.toneChip)}>
              En curso
            </span>
            <span className="capitalize">{todayHuman}</span>
          </div>
          <h2 className="mt-1 text-[20px] font-semibold text-[var(--color-text-1)]">
            Turno de {current.label.toLowerCase()}{" "}
            <span className="text-[var(--color-text-3)] font-normal">
              · {hourLabel(current.startHour)}–{hourLabel(current.key === "N" ? 6 : current.endHour)}
            </span>
          </h2>

          {/* Mini progreso */}
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface)]/60">
              <div
                className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-1000", current.toneBar)}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-[var(--color-text-2)]">
              {progress}%
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--color-text-3)]">
            <span>
              Empezó hace <strong className="text-[var(--color-text-2)]">{formatHm(elapsedMs)}</strong>
            </span>
            <span aria-hidden>·</span>
            <span>
              Quedan{" "}
              <strong className="text-[var(--color-text-2)]">{formatHm(remainingMs)}</strong> para cerrar
            </span>
          </p>
        </div>

        {/* Pill "Siguiente" */}
        <div className="flex shrink-0 flex-col items-end gap-1.5 md:items-end">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border bg-[var(--color-surface)]/60 px-3 py-1.5 text-[11.5px] backdrop-blur-sm",
              next.toneBorder,
            )}
          >
            <ArrowRight size={12} className="text-[var(--color-text-3)]" aria-hidden />
            <NextIcon size={14} className={next.toneText} aria-hidden />
            <span className="font-semibold text-[var(--color-text-1)]">{next.label}</span>
            <span className="text-[var(--color-text-3)]">
              · {hourLabel(next.startHour)} · en {formatHm(nextStartAt.getTime() - now.getTime())}
            </span>
          </div>
          {unackedCount > 0 ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-warning)]">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-warning)]/70 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
              </span>
              {unackedCount} pase{unackedCount === 1 ? "" : "s"} por firmar
            </div>
          ) : authorOfLastHandover ? (
            <p className="text-[10.5px] text-[var(--color-text-3)]">
              Último pase entregado por{" "}
              <span className="text-[var(--color-text-2)]">{authorOfLastHandover}</span>
            </p>
          ) : null}
        </div>
      </div>

      {/* Stepper de turnos (M T N) en la franja inferior */}
      <div className="relative mt-4 flex items-center gap-1 border-t border-[var(--color-border)]/50 pt-3">
        {SHIFTS.map((s) => {
          const active = s.key === current.key;
          const SIcon = s.Icon;
          return (
            <div
              key={s.key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-colors",
                active
                  ? cn("border", s.toneBorder, s.toneChip)
                  : "text-[var(--color-text-3)]",
              )}
              aria-current={active ? "true" : undefined}
            >
              <SIcon size={11} aria-hidden />
              {s.label}{" "}
              <span className="font-normal opacity-70">
                {hourLabel(s.startHour)}–{hourLabel(s.key === "N" ? 6 : s.endHour)}
              </span>
            </div>
          );
        })}
        <span
          className="ml-auto text-[10px] uppercase tracking-widest text-[var(--color-text-3)]"
          aria-hidden
        >
          Centro de Control · {endAt > startAt ? "" : ""}
        </span>
      </div>
    </section>
  );
}
