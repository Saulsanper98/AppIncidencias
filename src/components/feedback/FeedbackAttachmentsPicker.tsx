"use client";

/**
 * FeedbackAttachmentsPicker
 * ─────────────────────────
 * Permite al usuario adjuntar capturas a su reporte de feedback con tres
 * mecanismos paralelos:
 *
 *   1. Click en el botón "Adjuntar imagen" → abre el `<input type="file">`.
 *   2. Drag & drop sobre la zona de dropzone (resaltado visual al arrastrar).
 *   3. Ctrl/Cmd + V con una imagen en el portapapeles. Detectamos paste a
 *      nivel de `window` mientras el form está montado, ideal para pegar
 *      capturas hechas con "Recortes" de Windows o Cmd+Shift+4 de macOS.
 *
 * El padre gestiona el array `files` (controlado) para poder reiniciarlo
 * desde fuera y para serializar el envío. Aquí solo notificamos cambios
 * vía `onChange`.
 *
 * NO sube nada al backend: el form principal hará el upload tras crear
 * el feedback (POST a /api/feedback/{id}/attachments).
 */

import { Camera, Clipboard, Image as ImageIcon, Loader2, Trash2, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  FEEDBACK_UPLOAD_ACCEPT,
  FEEDBACK_UPLOAD_MAX_FILES,
  FEEDBACK_UPLOAD_MAX_IMAGE_BYTES,
  FEEDBACK_UPLOAD_MAX_TOTAL_BYTES,
  isAcceptedFeedbackImage,
} from "@/lib/feedback-uploads";
import { cn } from "@/lib/utils";

type Props = {
  files: File[];
  onChange: (next: File[]) => void;
  disabled?: boolean;
};

export function FeedbackAttachmentsPicker({ files, onChange, disabled = false }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteHint, setPasteHint] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragCounter = useRef(0);

  // Generamos previews objectURL una sola vez por File (no en cada render
  // para evitar parpadeos) y los revocamos al desmontar / cambiar.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  /**
   * Aplica validación común (tipo / tamaño / conteo) y añade los nuevos.
   * Devuelve un array de errores legibles (vacío si todo OK).
   */
  const addFiles = useCallback(
    (incoming: File[]) => {
      if (disabled) return;
      if (incoming.length === 0) return;

      const errors: string[] = [];
      const accepted: File[] = [];
      let acumBytes = totalBytes;

      const remainingSlots = FEEDBACK_UPLOAD_MAX_FILES - files.length;
      if (remainingSlots <= 0) {
        setError(`Ya tienes ${FEEDBACK_UPLOAD_MAX_FILES} adjuntos (máximo).`);
        return;
      }

      for (const f of incoming.slice(0, remainingSlots)) {
        if (!isAcceptedFeedbackImage(f.type, f.name)) {
          errors.push(`"${f.name || "archivo"}": no es una imagen válida.`);
          continue;
        }
        if (f.size > FEEDBACK_UPLOAD_MAX_IMAGE_BYTES) {
          errors.push(`"${f.name || "archivo"}": supera 5 MB.`);
          continue;
        }
        if (acumBytes + f.size > FEEDBACK_UPLOAD_MAX_TOTAL_BYTES) {
          errors.push(`Tamaño total supera 25 MB combinados.`);
          break;
        }
        accepted.push(f);
        acumBytes += f.size;
      }

      if (incoming.length > remainingSlots) {
        errors.push(`Solo se admiten ${FEEDBACK_UPLOAD_MAX_FILES} adjuntos en total.`);
      }

      if (accepted.length > 0) onChange([...files, ...accepted]);
      setError(errors.length ? errors.join(" ") : null);
    },
    [disabled, files, onChange, totalBytes],
  );

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer?.types?.includes("Files")) {
      setIsDragging(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      setIsDragging(false);
      dragCounter.current = 0;
    }
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length) addFiles(dropped);
  };

  // ── Paste (Ctrl/Cmd + V) ──────────────────────────────────────────────────
  useEffect(() => {
    if (disabled) return;
    const onPaste = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;
      const items = Array.from(event.clipboardData.items);
      const imgFiles: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) {
            // Renombrar al pegar para que tenga sentido en disco.
            const renamed = new File([f], `pegado-${Date.now()}.${guessExt(item.type)}`, {
              type: item.type,
            });
            imgFiles.push(renamed);
          }
        }
      }
      if (imgFiles.length > 0) {
        addFiles(imgFiles);
        setPasteHint(true);
        window.setTimeout(() => setPasteHint(false), 1800);
      }
    };
    window.addEventListener("paste", onPaste as EventListener);
    return () => window.removeEventListener("paste", onPaste as EventListener);
  }, [addFiles, disabled]);

  // ── Remove ────────────────────────────────────────────────────────────────
  const removeAt = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    onChange(next);
    if (error) setError(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-label text-[var(--color-text-2)]">
          Capturas adjuntas{" "}
          <span className="font-normal normal-case tracking-normal text-[var(--color-text-3)]">
            (opcional · máx {FEEDBACK_UPLOAD_MAX_FILES} · 5 MB cada una)
          </span>
        </label>
        {files.length > 0 ? (
          <span className="text-[10.5px] text-[var(--color-text-3)] tabular-nums">
            {files.length} / {FEEDBACK_UPLOAD_MAX_FILES} · {formatBytes(totalBytes)}
          </span>
        ) : null}
      </div>

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-all",
          isDragging
            ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-2)]/40 hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-surface-2)]/70",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={FEEDBACK_UPLOAD_ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            if (list.length) addFiles(list);
            e.target.value = "";
          }}
        />

        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
            isDragging
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-surface-3)] text-[var(--color-text-3)] group-hover:bg-[var(--color-accent-light)] group-hover:text-[var(--color-accent)]",
          )}
        >
          {isDragging ? <UploadCloud size={20} /> : <ImageIcon size={18} />}
        </div>

        <div className="space-y-0.5">
          <p className="text-sm font-medium text-[var(--color-text-1)]">
            {isDragging ? "Suelta para adjuntar" : "Arrastra una imagen aquí"}
          </p>
          <p className="text-[11px] text-[var(--color-text-3)]">
            o pulsa{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="font-medium text-[var(--color-accent)] underline-offset-2 hover:underline"
            >
              elige un archivo
            </button>{" "}
            · también{" "}
            <span className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-px font-mono text-[10px] text-[var(--color-text-2)]">
              <Clipboard size={9} /> Ctrl + V
            </span>{" "}
            pega la captura
          </p>
        </div>

        {pasteHint ? (
          <div className="pointer-events-none absolute inset-x-3 top-2 mx-auto w-fit rounded-full bg-[var(--color-success)] px-3 py-0.5 text-[10.5px] font-medium text-white shadow-md">
            <Camera size={10} className="-mt-0.5 mr-1 inline" />
            Captura pegada
          </div>
        ) : null}
      </div>

      {files.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="group/thumb relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previews[i]}
                alt={f.name}
                className="aspect-[4/3] h-full w-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Quitar ${f.name}`}
                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white opacity-100 backdrop-blur-sm transition-opacity hover:bg-black/75 focus:opacity-100 md:h-6 md:w-6 md:opacity-0 md:group-hover/thumb:opacity-100"
              >
                <Trash2 size={12} />
              </button>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-1.5 py-1">
                <p className="truncate text-[10px] font-medium text-white" title={f.name}>
                  {f.name}
                </p>
                <p className="text-[9.5px] text-white/70 tabular-nums">{formatBytes(f.size)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-1.5 rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-2.5 py-1.5 text-[11px] text-[var(--color-error)]">
          <X size={11} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** Modal de cargando reutilizable para cuando el padre está subiendo. */
export function AttachmentsUploadingHint({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-2 text-xs text-[var(--color-text-2)]">
      <Loader2 size={13} className="animate-spin text-[var(--color-accent)]" />
      Subiendo {count} {count === 1 ? "captura" : "capturas"}…
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function guessExt(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "png";
}
