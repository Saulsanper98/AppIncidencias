"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ModalShell } from "@/components/ui/modal-shell";
import { canaryParts, formatCanaryHHMM } from "@/lib/datetime/canary";
import { cn } from "@/lib/utils";

const MAX_BYTES = 12 * 1024 * 1024;

type CreatedDesvio = {
  id: string;
  referencia: string;
  via: string;
  fecha_inicio: string;
  fecha_fin: string;
  lineas_afectadas: string[];
};

type SkippedDesvio = {
  referencia: string;
  fecha_inicio: string;
  motivo: string;
};

type UploadResponse = {
  created: CreatedDesvio[];
  skipped: SkippedDesvio[];
  pdf_path: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Llamado cuando se importa al menos un desvio (para refrescar la tabla). */
  onImported?: (result: UploadResponse) => void;
};

type Phase =
  | { kind: "idle" }
  | { kind: "selected"; file: File }
  | { kind: "uploading"; file: File }
  | { kind: "done"; result: UploadResponse }
  | { kind: "error"; message: string; file?: File };

export function DesvioImportPdfDialog({ open, onClose, onImported }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset al cerrar para que la proxima apertura este limpia.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setPhase({ kind: "idle" }), 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  const validateFile = useCallback((file: File): string | null => {
    if (file.size <= 0) return "El archivo esta vacio.";
    if (file.size > MAX_BYTES) {
      return `El archivo supera ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`;
    }
    const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name);
    const isImage =
      /^image\//i.test(file.type) ||
      /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name);
    if (!isPdf && !isImage) {
      return "Solo se aceptan PDFs o imagenes (PNG/JPG).";
    }
    return null;
  }, []);

  const handleSelect = useCallback(
    (file: File) => {
      const err = validateFile(file);
      if (err) {
        setPhase({ kind: "error", message: err });
        return;
      }
      setPhase({ kind: "selected", file });
    },
    [validateFile],
  );

  const handleUpload = useCallback(async () => {
    if (phase.kind !== "selected") return;
    const file = phase.file;
    setPhase({ kind: "uploading", file });
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await fetch("/api/desvios/upload-pdf", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as
        | UploadResponse
        | { message?: string };
      if (!res.ok) {
        const msg =
          (data as { message?: string })?.message ??
          `Error del servidor (HTTP ${res.status}).`;
        setPhase({ kind: "error", message: msg, file });
        return;
      }
      const result = data as UploadResponse;
      setPhase({ kind: "done", result });
      if (result.created.length > 0 && onImported) onImported(result);
    } catch (err) {
      setPhase({
        kind: "error",
        message:
          err instanceof Error
            ? `Error de red: ${err.message}`
            : "Error de red al subir el PDF.",
        file,
      });
    }
  }, [phase, onImported]);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setDragOver(false);
      if (phase.kind === "uploading") return;
      const file = event.dataTransfer.files?.[0];
      if (file) handleSelect(file);
    },
    [phase.kind, handleSelect],
  );

  const handleClose = useCallback(() => {
    if (phase.kind !== "uploading") onClose();
  }, [phase.kind, onClose]);

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      shake={phase.kind === "error"}
      maxWidth="36rem"
      title={
        <span className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
            <UploadCloud size={18} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Importar Circular Informativa</span>
            <span className="mt-0.5 block text-[12px] font-normal text-[var(--color-text-3)]">
              Sube el PDF o una captura (PNG/JPG). La app extraera el contenido y, si el PDF es una
              imagen, aplicara OCR. El desvio quedara como{" "}
              <strong className="font-semibold">PENDIENTE</strong> hasta que alguien lo confirme.
            </span>
          </span>
        </span>
      }
      footer={
        phase.kind === "done" ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--color-accent)]/85"
          >
            Cerrar
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleClose}
              disabled={phase.kind === "uploading"}
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)] disabled:opacity-50"
            >
              Cancelar
            </button>
            {phase.kind === "error" ? (
              <button
                type="button"
                onClick={() => {
                  if (phase.file) {
                    setPhase({ kind: "selected", file: phase.file });
                  } else {
                    setPhase({ kind: "idle" });
                    inputRef.current?.click();
                  }
                }}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--color-accent)]/85"
              >
                {phase.file ? "Reintentar" : "Elegir otro"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleUpload}
                disabled={phase.kind !== "selected"}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--color-accent)]/85 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {phase.kind === "uploading" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                    Procesando...
                  </>
                ) : (
                  <>
                    <UploadCloud size={14} aria-hidden />
                    Importar
                  </>
                )}
              </button>
            )}
          </>
        )
      }
    >
      {/* Estados idle / selected / uploading */}
              {(phase.kind === "idle" ||
                phase.kind === "selected" ||
                phase.kind === "uploading") && (
                <>
                  <label
                    htmlFor="desvio-pdf-input"
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (phase.kind !== "uploading") setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-5 py-10 text-center transition-colors",
                      dragOver
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface-2)]/40 hover:border-[var(--color-accent)]/60 hover:bg-[var(--color-accent-light)]/60",
                      phase.kind === "uploading" && "pointer-events-none opacity-60",
                    )}
                  >
                    {phase.kind === "uploading" ? (
                      <>
                        <Loader2
                          size={28}
                          className="animate-spin text-[var(--color-accent)]"
                          aria-hidden
                        />
                        <p className="text-[13px] font-medium text-[var(--color-text-1)]">
                          Procesando archivo...
                        </p>
                        <p className="text-[11.5px] text-[var(--color-text-3)]">
                          Si el PDF tiene texto va rapido. Si necesita OCR
                          puede tardar 10-30 segundos. No cierres la ventana.
                        </p>
                      </>
                    ) : phase.kind === "selected" ? (
                      <>
                        <FileText
                          size={28}
                          className="text-[var(--color-accent)]"
                          aria-hidden
                        />
                        <p className="max-w-full truncate text-[13px] font-medium text-[var(--color-text-1)]">
                          {phase.file.name}
                        </p>
                        <p className="text-[11.5px] text-[var(--color-text-3)]">
                          {(phase.file.size / 1024).toFixed(1)} KB {"\u00B7"} Listo para importar
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--color-text-3)]">
                          Suelta otro archivo o pulsa para reemplazar.
                        </p>
                      </>
                    ) : (
                      <>
                        <UploadCloud
                          size={28}
                          className={cn(
                            "transition-colors",
                            dragOver
                              ? "text-[var(--color-accent)]"
                              : "text-[var(--color-text-3)]",
                          )}
                          aria-hidden
                        />
                        <p className="text-[13px] font-medium text-[var(--color-text-1)]">
                          Arrastra el PDF o una imagen aqui, o haz click para seleccionar
                        </p>
                        <p className="text-[11.5px] text-[var(--color-text-3)]">
                          PDF, PNG o JPG. Maximo{" "}
                          {Math.round(MAX_BYTES / (1024 * 1024))} MB.
                        </p>
                      </>
                    )}
                    <input
                      id="desvio-pdf-input"
                      ref={inputRef}
                      type="file"
                      accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/bmp,image/tiff,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handleSelect(file);
                        event.target.value = "";
                      }}
                      disabled={phase.kind === "uploading"}
                    />
                  </label>

                  <div className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2 text-[11.5px] text-[var(--color-text-3)]">
                    <strong className="text-[var(--color-text-2)]">Recuerda:</strong>{" "}
                    el PDF debe ser una &quot;Circular Informativa&quot; de jefe de sala. Si el
                    parser no reconoce algo, puedes editar el desvio en su detalle
                    mientras siga en estado PENDIENTE.
                  </div>
                </>
              )}

              {/* Estado done */}
              {phase.kind === "done" && (
                <ResultPanel result={phase.result} onClose={onClose} />
              )}

              {/* Estado error */}
              {phase.kind === "error" && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      size={18}
                      className="mt-0.5 shrink-0 text-rose-300"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-rose-100">
                        No se pudo importar el PDF
                      </p>
                      <p className="mt-1 break-words text-[12px] text-rose-100/90">
                        {phase.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}
    </ModalShell>
  );
}

function ResultPanel({
  result,
  onClose,
}: {
  result: UploadResponse;
  onClose: () => void;
}) {
  const createdCount = result.created.length;
  const skippedCount = result.skipped.length;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
        <CheckCircle2
          size={20}
          className="mt-0.5 shrink-0 text-emerald-300"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-emerald-100">
            {createdCount > 0
              ? `Se importaron ${createdCount} desvio${createdCount === 1 ? "" : "s"}.`
              : "El PDF no genero desvios nuevos."}
          </p>
          {createdCount > 0 ? (
            <p className="mt-0.5 text-[12px] text-emerald-100/85">
              Quedan en estado PENDIENTE: confirmalos cuando los valides.
            </p>
          ) : null}
        </div>
      </div>

      {createdCount > 0 ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
            Creados
          </p>
          <ul className="space-y-1.5">
            {result.created.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-[var(--color-text-1)]">
                    {d.via}
                  </p>
                  <p className="truncate text-[11px] text-[var(--color-text-3)]">
                    {d.referencia} {"\u00B7"} {formatDateSpan(d.fecha_inicio, d.fecha_fin)}{" "}
                    {d.lineas_afectadas.length > 0
                      ? `${"\u00B7"} L. ${d.lineas_afectadas.join(", ")}`
                      : ""}
                  </p>
                </div>
                <a
                  href={`/desvios/${d.id}`}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11.5px] font-medium text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
                  onClick={onClose}
                >
                  Ver
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {skippedCount > 0 ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
            Omitidos ({skippedCount})
          </p>
          <ul className="space-y-1.5">
            {result.skipped.map((s, idx) => (
              <li
                key={`${s.referencia}-${idx}`}
                className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
              >
                <p className="text-[12px] font-medium text-amber-100">
                  {s.referencia}{" "}
                  <span className="text-amber-200/80">
                    {"\u00B7"} {formatDate(s.fecha_inicio)}
                  </span>
                </p>
                <p className="text-[11px] text-amber-100/80">{s.motivo}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Atlantic/Canary",
  });
}

function formatDateSpan(inicio: string, fin: string): string {
  const ini = new Date(inicio);
  const end = new Date(fin);
  // Comparamos el dia en TZ Atlantic/Canary (no la del navegador) para que el
  // sufijo "(+1d)" se calcule sobre la hora canaria real del corte.
  const pi = canaryParts(ini);
  const pe = canaryParts(end);
  const sameDay =
    pi.year === pe.year && pi.month === pe.month && pi.day === pe.day;
  const dayStr = ini.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    timeZone: "Atlantic/Canary",
  });
  const hi = formatCanaryHHMM(ini);
  const hf = formatCanaryHHMM(end);
  return sameDay ? `${dayStr} ${hi}-${hf}` : `${dayStr} ${hi} -> ${hf} (+1d)`;
}
