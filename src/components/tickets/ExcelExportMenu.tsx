"use client";

/**
 * Menú "Excel" del listado de tickets con selector de rango de fechas.
 *
 * Sustituye al botón simple anterior que exportaba sin opción de rango. El
 * usuario elige entre rangos predefinidos (Hoy, Ayer, 7d, 30d, Mes en curso,
 * Mes anterior) o un rango personalizado. Cualquier filtro activo de la
 * bandeja (estado, prioridad, operadora, etc.) sigue aplicándose.
 *
 * Sugerencia de Javi (técnico): "poder elegir desde qué fecha hasta qué fecha
 * sacar el Excel".
 */

import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown, Download } from "lucide-react";

import { cn } from "@/lib/utils";

export type ExcelExportBaseQuery = URLSearchParams;

type Preset = {
  id: "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "all";
  label: string;
  hint?: string;
};

const PRESETS: Preset[] = [
  { id: "today", label: "Hoy", hint: "Tickets creados hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "last7", label: "Últimos 7 días" },
  { id: "last30", label: "Últimos 30 días" },
  { id: "thisMonth", label: "Mes en curso" },
  { id: "lastMonth", label: "Mes anterior" },
  { id: "all", label: "Sin límite de fecha", hint: "Aplica solo los filtros visibles" },
];

type Props = {
  /** Devuelve una URLSearchParams con los filtros actuales (sin rango). */
  buildBaseQuery: () => ExcelExportBaseQuery;
  disabled?: boolean;
};

export function ExcelExportMenu({ buildBaseQuery, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Cierre al click fuera y Escape para una UX previsible.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerExport = (preset: Preset["id"] | "custom", custom?: { from?: string; to?: string }) => {
    const query = buildBaseQuery();
    if (preset !== "all") {
      query.set("range", preset === "custom" ? "custom" : preset);
    }
    if (preset === "custom") {
      if (custom?.from) query.set("from", custom.from);
      if (custom?.to) query.set("to", custom.to);
    }
    const qs = query.toString();
    window.location.assign(`/api/tickets/export${qs ? `?${qs}` : ""}`);
    setOpen(false);
    setCustomOpen(false);
  };

  const handleCustomSubmit = () => {
    if (!customFrom && !customTo) return;
    triggerExport("custom", { from: customFrom || undefined, to: customTo || undefined });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="Exportar la bandeja a Excel: elige rango de fechas"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-xs text-[var(--color-text-2)] transition-all duration-200 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0",
          open && "border-[var(--color-accent)]/40 text-[var(--color-text-1)]",
        )}
      >
        <Download size={12} aria-hidden />
        Excel
        <ChevronDown
          size={11}
          aria-hidden
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-lg ring-1 ring-black/5"
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10.5px] uppercase tracking-wide text-[var(--color-text-3)]">
            <CalendarRange size={11} aria-hidden />
            Rango de fechas
          </div>
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="menuitem"
              onClick={() => triggerExport(preset.id)}
              className="block w-full rounded-md px-2 py-1.5 text-left text-[12.5px] text-[var(--color-text-1)] transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <span className="block font-medium">{preset.label}</span>
              {preset.hint ? (
                <span className="block text-[10.5px] text-[var(--color-text-3)]">{preset.hint}</span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            aria-expanded={customOpen}
            className={cn(
              "mt-1 block w-full rounded-md border border-dashed border-[var(--color-border)] px-2 py-1.5 text-left text-[12px] text-[var(--color-text-2)] transition-colors hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text-1)]",
              customOpen && "border-[var(--color-accent)]/40 text-[var(--color-text-1)]",
            )}
          >
            {customOpen ? "▾" : "▸"} Rango personalizado…
          </button>
          {customOpen ? (
            <div className="mt-1 space-y-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-2">
              <label className="block">
                <span className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-3)]">
                  Desde
                </span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  max={customTo || undefined}
                  className="mt-0.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                />
              </label>
              <label className="block">
                <span className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-3)]">
                  Hasta
                </span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  min={customFrom || undefined}
                  className="mt-0.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                />
              </label>
              <button
                type="button"
                onClick={handleCustomSubmit}
                disabled={!customFrom && !customTo}
                className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md bg-[var(--color-accent)] px-2 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={11} aria-hidden />
                Exportar rango
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
