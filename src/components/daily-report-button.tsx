"use client";

import {
  AlertTriangle,
  Bus,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  Info,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { toast } from "@/components/toast-host";
import { InlineCalendar } from "@/components/ui/inline-calendar";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils";

type ReportEntry = {
  id: string;
  ticketCount: number;
  createdAt: string;
  generatedByName: string | null;
  generatedByEmail: string | null;
  wasMine: boolean;
};

type ReportStatus = {
  reportDate: string;
  count: number;
  generatedToday: boolean;
  reports: ReportEntry[];
};

/** Clave en sessionStorage donde guardamos el último valor de "vehículos
 *  activos" introducido. Sirve para pre-rellenar el popup en la siguiente
 *  generación del día (no se persiste entre sesiones). */
const ACTIVE_BUSES_STORAGE_KEY = "ccmgc:daily-report:active-buses";

/**
 * Boton "Generar informe diario" con selector de dia.
 *
 *  1) Click en la mitad principal -> abre popup pidiendo "Vehículos activos
 *     en el turno". Tras confirmar, descarga el informe del DIA SELECCIONADO
 *     (por defecto hoy).
 *  2) Click en la flechita -> abre un popover con `<input type="date">` para
 *     elegir otro dia (p. ej. ayer si se olvido sacarlo).
 *  3) Si ya existe alguna generacion para ese dia hecha por otra persona,
 *     pide confirmacion antes de seguir.
 *
 * Nunca bloquea la generacion: los avisos son informativos.
 *
 * El nº de vehículos activos lo introduce el operador en cada generación
 * (no se calcula automáticamente). Es una foto del estado de la flota en
 * ese turno y NO se suma entre informes del mismo día.
 */
export function DailyReportButton() {
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [warningOpen, setWarningOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [monthDots, setMonthDots] = useState<Record<string, number>>({});
  // Modal de "vehículos activos": se muestra antes de generar.
  const [activeBusesOpen, setActiveBusesOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<{
    top: number;
    left: number;
    width: number;
    openUp: boolean;
  } | null>(null);

  const POPOVER_WIDTH = 280;
  const POPOVER_GAP = 8;
  const POPOVER_ESTIMATED_HEIGHT = 420;

  const updatePickerAnchor = useCallback(() => {
    const root = pickerRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_ESTIMATED_HEIGHT + POPOVER_GAP && rect.top > spaceBelow;
    const top = openUp ? rect.top - POPOVER_GAP : rect.bottom + POPOVER_GAP;
    const left = Math.min(
      Math.max(12, rect.right - POPOVER_WIDTH),
      window.innerWidth - POPOVER_WIDTH - 12,
    );
    setPickerAnchor({ top, left, width: POPOVER_WIDTH, openUp });
  }, []);

  useLayoutEffect(() => {
    if (!pickerOpen) {
      setPickerAnchor(null);
      return;
    }
    updatePickerAnchor();
    const onLayout = () => updatePickerAnchor();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [pickerOpen, updatePickerAnchor]);

  const loadMonthDots = useCallback(async (ym: string) => {
    try {
      const res = await fetch(`/api/reports/daily/month?ym=${encodeURIComponent(ym)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { ym: string; days: Record<string, number> };
      setMonthDots(data.days ?? {});
    } catch {
      // El calendario sigue funcionando aunque no se carguen los puntitos.
    }
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    void loadMonthDots(selectedDate.slice(0, 7));
  }, [pickerOpen, selectedDate, loadMonthDots]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/daily/today?date=${encodeURIComponent(selectedDate)}`, {
        credentials: "include",
      });
      if (res.status === 401) {
        pollingDisabledRef.current = true;
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as ReportStatus;
      setStatus(data);
    } catch (error) {
      console.warn("No se pudo comprobar informe diario:", error);
    }
  }, [selectedDate]);

  const pollingDisabledRef = useRef(false);

  useEffect(() => {
    pollingDisabledRef.current = false;
    void refreshStatus();
    // Solo refrescamos automaticamente cuando es el dia de hoy (estado vivo);
    // para dias pasados es un dato historico estable.
    if (selectedDate !== todayIso()) return;
    const t = setInterval(() => {
      if (pollingDisabledRef.current) return;
      void refreshStatus();
    }, 60_000);
    return () => clearInterval(t);
  }, [refreshStatus, selectedDate]);

  // Cierra el popover al hacer click fuera o pulsar Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (pickerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setPickerOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  // Generaciones de OTRAS personas para el dia seleccionado.
  const generatedByOthers = useMemo(() => {
    if (!status) return [];
    return status.reports.filter((r) => !r.wasMine);
  }, [status]);

  const isToday = selectedDate === todayIso();

  /**
   * Lanza el POST al backend con el nº de vehículos activos introducido
   * por el operador. Nunca se llama directamente desde el botón: siempre
   * pasa antes por el popup `ActiveBusesDialog` que captura el número.
   */
  const generateNow = useCallback(
    async (activeBusesCount: number) => {
      if (generating) return;
      setGenerating(true);
      setActiveBusesOpen(false);
      setWarningOpen(false);
      try {
        const res = await fetch("/api/reports/daily", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: selectedDate, activeBusesCount }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          toast.error("No se pudo generar el informe", {
            description: txt || `Error ${res.status}`,
          });
          return;
        }
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const match = /filename="?([^";]+)"?/i.exec(disposition);
        const filename = match?.[1] ?? `informe-incidencias-${selectedDate}.xlsx`;
        triggerDownload(blob, filename);
        toast.success("Informe generado", {
          description: `Descargando ${filename}`,
        });
        // Persistimos el último valor en sessionStorage para pre-rellenar
        // el popup la próxima vez del día.
        try {
          sessionStorage.setItem(ACTIVE_BUSES_STORAGE_KEY, String(activeBusesCount));
        } catch {
          // sessionStorage puede fallar en modo privado: no es crítico.
        }
        await refreshStatus();
      } catch (error) {
        console.error("Error generando informe:", error);
        toast.error("Error de red", {
          description: "No se pudo contactar con el servidor.",
        });
      } finally {
        setGenerating(false);
      }
    },
    [generating, refreshStatus, selectedDate],
  );

  /**
   * Flujo del botón "Generar":
   *   1. Si otros ya generaron hoy → mostrar advertencia primero.
   *   2. Si confirma (o no había duplicados) → abrir popup de vehículos.
   *   3. El popup llama a generateNow(count) al confirmar.
   */
  const handleClick = useCallback(() => {
    if (generatedByOthers.length > 0) {
      setWarningOpen(true);
      return;
    }
    setActiveBusesOpen(true);
  }, [generatedByOthers]);

  const alreadyGenerated = (status?.count ?? 0) > 0;

  const title = isToday
    ? alreadyGenerated
      ? `Informe ya generado hoy (${status?.count} ${status?.count === 1 ? "vez" : "veces"})`
      : "Generar informe diario para Jefatura"
    : alreadyGenerated
      ? `Informe del ${formatHumanDate(selectedDate)} ya generado (${status?.count} ${status?.count === 1 ? "vez" : "veces"})`
      : `Generar informe del ${formatHumanDate(selectedDate)}`;

  return (
    <>
      <div ref={pickerRef} className="relative inline-flex items-stretch">
        <div
          className={cn(
            "inline-flex items-stretch overflow-hidden rounded-xl border transition-all duration-150",
            alreadyGenerated
              ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
              : "border-[var(--color-accent)]/35 bg-[var(--color-accent-light)] text-[var(--color-accent)]",
          )}
        >
          <button
            type="button"
            onClick={handleClick}
            disabled={generating}
            title={title}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors",
              alreadyGenerated
                ? "hover:bg-amber-500/15"
                : "hover:bg-[var(--color-accent-light)]/80",
              generating && "opacity-70",
            )}
          >
            {generating ? (
              <Loader2 size={13} className="animate-spin" aria-hidden />
            ) : alreadyGenerated ? (
              <AlertTriangle size={13} aria-hidden />
            ) : (
              <FileSpreadsheet size={13} aria-hidden />
            )}
            <span className="hidden sm:inline">
              {generating
                ? "Generando..."
                : isToday
                  ? "Informe diario"
                  : `Informe ${formatChipDate(selectedDate)}`}
            </span>
            <span className="sm:hidden">Informe</span>
            {alreadyGenerated && !generating && (
              <span
                className="ml-0.5 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-amber-500/30 px-1 text-[10px] font-semibold text-amber-100"
                aria-label={`Ya generado ${status?.count ?? 0} veces`}
              >
                {status?.count ?? 0}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            disabled={generating}
            aria-expanded={pickerOpen}
            aria-haspopup="dialog"
            title="Cambiar el día del informe"
            className={cn(
              "inline-flex items-center gap-1 border-l px-2 text-xs transition-colors",
              alreadyGenerated
                ? "border-amber-500/30 hover:bg-amber-500/15"
                : "border-[var(--color-accent)]/25 hover:bg-[var(--color-accent-light)]/80",
            )}
          >
            <CalendarDays size={12} aria-hidden />
            <ChevronDown
              size={11}
              aria-hidden
              className={cn("transition-transform", pickerOpen && "rotate-180")}
            />
          </button>
        </div>

        {pickerOpen && pickerAnchor && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={popoverRef}
                role="dialog"
                aria-label="Elegir día del informe"
                style={{
                  position: "fixed",
                  top: pickerAnchor.top,
                  left: pickerAnchor.left,
                  width: pickerAnchor.width,
                  zIndex: 200,
                  transform: pickerAnchor.openUp ? "translateY(-100%)" : undefined,
                }}
                className="daily-report-popover max-h-[min(32rem,calc(100vh-1.5rem))] origin-top-right overflow-hidden overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-[0_24px_64px_-20px_rgba(0,0,0,0.65)]"
              >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface-2)]/60 to-[var(--color-surface)] px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                  Día del informe
                </p>
                <p className="mt-0.5 text-[11.5px] capitalize text-[var(--color-text-3)]">
                  {formatWeekday(selectedDate)}
                </p>
                <p className="text-[15px] font-semibold leading-tight text-[var(--color-text-1)]">
                  {formatHumanDate(selectedDate)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  isToday
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-[var(--color-surface-3)] text-[var(--color-text-2)]",
                )}
              >
                {isToday ? "Hoy" : daysAgoLabel(selectedDate)}
              </span>
            </header>

            <div className="px-4 py-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                Accesos rápidos
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Hoy", iso: todayIso() },
                  { label: "Ayer", iso: yesterdayIso() },
                  { label: "−2 d", iso: daysAgoIso(2) },
                  { label: "−7 d", iso: daysAgoIso(7) },
                ].map((p) => {
                  const active = selectedDate === p.iso;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setSelectedDate(p.iso)}
                      aria-pressed={active}
                      className={cn(
                        "h-7 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                        active
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white shadow-sm"
                          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-surface-3)]",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                Otro día
              </p>
              <InlineCalendar
                value={selectedDate}
                onChange={(iso) => setSelectedDate(iso)}
                maxIso={todayIso()}
                dotsMap={monthDots}
                dotColor="amber"
                onMonthChange={loadMonthDots}
              />

              <div
                className={cn(
                  "mt-3 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11.5px]",
                  alreadyGenerated
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)]/60 text-[var(--color-text-3)]",
                )}
              >
                {alreadyGenerated ? (
                  <>
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
                    <span>
                      Ya hay{" "}
                      <strong className="font-semibold">
                        {status?.count ?? 0} generaci{(status?.count ?? 0) === 1 ? "ón" : "ones"}
                      </strong>{" "}
                      registradas para este día.
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-300/80" aria-hidden />
                    <span>Sin informes generados todavía para este día.</span>
                  </>
                )}
              </div>
            </div>

            <footer className="flex items-center justify-end gap-1.5 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2.5">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  handleClick();
                }}
                disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-all hover:shadow-md hover:brightness-110 disabled:opacity-60"
              >
                <FileSpreadsheet size={13} aria-hidden />
                {generating ? "Generando..." : "Generar XLSX"}
              </button>
            </footer>
              </div>,
              document.body,
            )
          : null}
      </div>

      {warningOpen && typeof document !== "undefined"
        ? createPortal(
            <DuplicateWarningDialog
              reports={generatedByOthers}
              reportDate={selectedDate}
              onCancel={() => setWarningOpen(false)}
              onContinue={() => {
                // Tras confirmar el aviso de duplicado, pedimos los
                // vehículos activos antes de generar (no saltarse el popup).
                setWarningOpen(false);
                setActiveBusesOpen(true);
              }}
            />,
            document.body,
          )
        : null}

      {activeBusesOpen && typeof document !== "undefined"
        ? createPortal(
            <ActiveBusesDialog
              reportDate={selectedDate}
              isToday={isToday}
              generating={generating}
              onCancel={() => setActiveBusesOpen(false)}
              onConfirm={(count) => void generateNow(count)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function DuplicateWarningDialog({
  reports,
  reportDate,
  onCancel,
  onContinue,
}: {
  reports: ReportEntry[];
  reportDate: string;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const isToday = reportDate === todayIso();

  return (
    <ModalShell
      open
      onClose={onCancel}
      size="md"
      className="overflow-hidden p-0"
      title={
        <span className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-200">
            <AlertTriangle size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {isToday
                ? "El informe ya se generó hoy"
                : `El informe del ${formatHumanDate(reportDate)} ya se generó`}
            </span>
            <span className="mt-0.5 block text-[12px] font-normal text-[var(--color-text-3)]">
              {reports.length === 1
                ? "Un compañero ya generó este informe."
                : `Ya hay ${reports.length} generaciones de este informe.`}{" "}
              Puedes generarlo de nuevo si lo necesitas.
            </span>
          </span>
        </span>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90"
          >
            <FileSpreadsheet size={14} aria-hidden />
            Generar igualmente
          </button>
        </>
      }
    >
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {reports.map((r) => (
          <li
            key={r.id}
            className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-2"
          >
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden />
            <div className="min-w-0 flex-1 text-[12.5px]">
              <p className="font-medium text-[var(--color-text-1)]">
                {r.generatedByName ?? "Usuario desconocido"}
              </p>
              <p className="text-[11.5px] text-[var(--color-text-3)]">
                {formatGeneratedAt(r.createdAt)} {"\u00b7"} {r.ticketCount}{" "}
                {r.ticketCount === 1 ? "incidencia" : "incidencias"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </ModalShell>
  );
}

/**
 * Popup que pide al operador cuántos vehículos hay ACTIVOS en el turno
 * antes de generar el informe. El dato sale en el Excel como una mini-card
 * de KPI ("VEHÍCULOS ACTIVOS") y NO se acumula entre generaciones del
 * mismo día — cada informe lleva su propia foto.
 */
function ActiveBusesDialog({
  reportDate,
  isToday,
  generating,
  onCancel,
  onConfirm,
}: {
  reportDate: string;
  isToday: boolean;
  generating: boolean;
  onCancel: () => void;
  onConfirm: (count: number) => void;
}) {
  // Pre-rellenamos con el último valor introducido en la sesión (si lo hay).
  const [value, setValue] = useState<string>(() => {
    try {
      return sessionStorage.getItem(ACTIVE_BUSES_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const parsed = Number(value);
  const isValid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 9999 && Number.isInteger(parsed);
  const showError = touched && !isValid;

  const handleSubmit = () => {
    setTouched(true);
    if (!isValid) {
      inputRef.current?.focus();
      return;
    }
    onConfirm(parsed);
  };

  return (
    <ModalShell
      open
      onClose={onCancel}
      size="md"
      shake={showError}
      initialFocusRef={inputRef}
      title={
        <span className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent)]">
            <Bus size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Servicios activos en el turno</span>
            <span className="mt-0.5 block text-[12px] font-normal text-[var(--color-text-3)]">
              {isToday
                ? "Confirma cuántos servicios hay activos ahora mismo."
                : `Servicios activos el ${formatHumanDate(reportDate)}.`}
            </span>
          </span>
        </span>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={generating}
            className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
          >
            {generating ? (
              <>
                <Loader2 size={13} className="animate-spin" aria-hidden />
                Generando…
              </>
            ) : (
              <>
                <FileSpreadsheet size={13} aria-hidden />
                Generar XLSX
              </>
            )}
          </button>
        </>
      }
    >
      <label htmlFor="active-buses-input" className="text-label text-[var(--color-text-2)]">
        Nº de servicios activos
      </label>
      <input
        id="active-buses-input"
        ref={inputRef}
        type="number"
        inputMode="numeric"
        min={1}
        max={9999}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (touched) setTouched(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Ej. 142"
        className={cn(
          "mt-2 w-full rounded-lg border bg-[var(--color-surface-2)] px-3 py-2.5 text-base font-semibold text-[var(--color-text-1)] tabular-nums placeholder:font-normal placeholder:text-[var(--color-text-3)] transition-colors focus:outline-none",
          showError
            ? "border-[var(--color-error)] focus:border-[var(--color-error)]"
            : "border-[var(--color-border)] focus:border-[var(--color-accent)]",
        )}
      />
      {showError ? (
        <p className="mt-1.5 text-[11.5px] text-[var(--color-error)]">
          Introduce un número entre 1 y 9999.
        </p>
      ) : null}

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-2.5 py-2 text-[11.5px] text-[var(--color-text-3)]">
        <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Es una <strong className="font-semibold text-[var(--color-text-2)]">foto de los servicios activos en el turno</strong>:
          si generas varios informes hoy, cada uno lleva su propio número y no se suman entre sí.
        </span>
      </div>
    </ModalShell>
  );
}

// =================== HELPERS ===================

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayIso(): string {
  return daysAgoIso(1);
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(iso: string): number {
  const a = new Date(`${iso}T00:00:00`);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function daysAgoLabel(iso: string): string {
  const n = daysBetween(iso);
  if (n <= 0) return "Hoy";
  if (n === 1) return "Ayer";
  if (n < 7) return `Hace ${n} días`;
  if (n < 30) return `Hace ${Math.round(n / 7)} sem.`;
  return `Hace ${Math.round(n / 30)} mes${Math.round(n / 30) === 1 ? "" : "es"}`;
}

function formatChipDate(iso: string): string {
  // dd/mm  -> compacto para el pill del boton
  const [, mm, dd] = iso.split("-");
  return `${dd}/${mm}`;
}

function formatWeekday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-ES", { weekday: "long" });
}

function formatHumanDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}
