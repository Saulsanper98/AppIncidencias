"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { toast } from "@/components/toast-host";
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

/**
 * Boton "Generar informe diario" que:
 *  1) Consulta al montar si ya se genero hoy y cambia su apariencia para avisar.
 *  2) Al hacer click, si ya existe por otro companero abre un modal de aviso.
 *     El usuario puede cancelar o continuar y generar igualmente.
 *  3) Hace POST al endpoint, descarga el XLSX, refresca el estado.
 *
 * No bloquea nunca la generacion: el aviso es solo informativo.
 */
export function DailyReportButton() {
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [warningOpen, setWarningOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/reports/daily/today", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as ReportStatus;
      setStatus(data);
    } catch (error) {
      console.warn("No se pudo comprobar informe diario:", error);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const t = setInterval(() => void refreshStatus(), 60_000);
    return () => clearInterval(t);
  }, [refreshStatus]);

  // Generaciones de OTROS companeros hoy (no las propias del usuario actual).
  const generatedByOthers = useMemo(() => {
    if (!status) return [];
    return status.reports.filter((r) => !r.wasMine);
  }, [status]);

  const generateNow = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setWarningOpen(false);
    try {
      const res = await fetch("/api/reports/daily", {
        method: "POST",
        credentials: "include",
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
      const filename = match?.[1] ?? `informe-incidencias-${todayIso()}.xlsx`;
      triggerDownload(blob, filename);
      toast.success("Informe generado", {
        description: `Descargando ${filename}`,
      });
      await refreshStatus();
    } catch (error) {
      console.error("Error generando informe:", error);
      toast.error("Error de red", {
        description: "No se pudo contactar con el servidor.",
      });
    } finally {
      setGenerating(false);
    }
  }, [generating, refreshStatus]);

  const handleClick = useCallback(() => {
    if (generatedByOthers.length > 0) {
      setWarningOpen(true);
      return;
    }
    void generateNow();
  }, [generatedByOthers, generateNow]);

  const alreadyToday = (status?.count ?? 0) > 0;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={generating}
        title={
          alreadyToday
            ? `Informe ya generado hoy (${status?.count} ${status?.count === 1 ? "vez" : "veces"})`
            : "Generar informe diario para Jefatura"
        }
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-150",
          alreadyToday
            ? "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:border-amber-400/60 hover:bg-amber-500/15"
            : "border-[var(--color-accent)]/35 bg-[var(--color-accent-light)] text-[var(--color-accent)] hover:border-[var(--color-accent)]/55 hover:bg-[var(--color-accent-light)]/80",
          generating && "opacity-70",
        )}
      >
        {generating ? (
          <Loader2 size={13} className="animate-spin" aria-hidden />
        ) : alreadyToday ? (
          <AlertTriangle size={13} aria-hidden />
        ) : (
          <FileSpreadsheet size={13} aria-hidden />
        )}
        <span className="hidden sm:inline">
          {generating ? "Generando..." : "Informe diario"}
        </span>
        <span className="sm:hidden">Informe</span>
        {alreadyToday && !generating && (
          <span
            className="ml-0.5 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-amber-500/30 px-1 text-[10px] font-semibold text-amber-100"
            aria-label={`Ya generado ${status?.count ?? 0} veces hoy`}
          >
            {status?.count ?? 0}
          </span>
        )}
      </button>

      {warningOpen && typeof document !== "undefined"
        ? createPortal(
            <DuplicateWarningDialog
              reports={generatedByOthers}
              onCancel={() => setWarningOpen(false)}
              onContinue={() => void generateNow()}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function DuplicateWarningDialog({
  reports,
  onCancel,
  onContinue,
}: {
  reports: ReportEntry[];
  onCancel: () => void;
  onContinue: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-report-warning-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_64px_-20px_rgba(0,0,0,0.6)]">
        <header className="flex items-start gap-3 border-b border-[var(--color-border)] bg-amber-500/10 px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-200">
            <AlertTriangle size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="daily-report-warning-title" className="text-sm font-semibold text-[var(--color-text-1)]">
              El informe ya se gener{"\u00f3"} hoy
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-3)]">
              {reports.length === 1
                ? `Un compa\u00f1ero ya gener\u00f3 el informe diario.`
                : `Ya hay ${reports.length} generaciones del informe de hoy.`}{" "}
              Puedes generarlo de nuevo si lo necesitas.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="max-h-64 overflow-y-auto px-5 py-4">
          <ul className="space-y-2">
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
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-5 py-3">
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
        </footer>
      </div>
    </div>
  );
}

// =================== HELPERS ===================

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
