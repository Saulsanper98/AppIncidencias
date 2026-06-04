"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StatusChangeModalProps = {
  open: boolean;
  title: string;
  targetLabel: string;
  comment: string;
  onCommentChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  error: string | null;
  submitting?: boolean;
};

export function StatusChangeModal({
  open,
  title,
  targetLabel,
  comment,
  onCommentChange,
  onConfirm,
  onCancel,
  error,
  submitting = false,
}: StatusChangeModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-change-modal-title"
        className={cn(
          "w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xl sm:p-5",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="status-change-modal-title" className="text-subheading text-[var(--color-text-1)]">
              {title}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-2)]">
              Nuevo estado: <span className="font-medium text-[var(--color-text-1)]">{targetLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-label">Comentario del cambio</span>
          <textarea
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            rows={4}
            className={cn(
              "w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-1)]",
              "placeholder:text-[var(--color-text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]",
            )}
            placeholder="Describe el motivo del cambio (minimo 3 caracteres)."
            autoFocus
          />
          <span className="text-caption text-[var(--color-text-3)]">{comment.trim().length} caracteres</span>
        </label>

        {error ? (
          <p className="mt-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-xs text-[var(--color-error)]">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" size="md" onClick={onConfirm} disabled={submitting}>
            {submitting ? "Guardando…" : "Confirmar cambio"}
          </Button>
        </div>
      </div>
    </div>
  );
}
