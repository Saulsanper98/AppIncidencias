"use client";

import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
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
  commentLabel?: string;
  commentPlaceholder?: string;
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
  commentLabel = "Comentario del cambio",
  commentPlaceholder = "Describe el motivo del cambio (minimo 3 caracteres).",
}: StatusChangeModalProps) {
  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      shake={Boolean(error)}
      title={title}
      maxWidth="28rem"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" size="md" onClick={onConfirm} disabled={submitting}>
            {submitting ? "Guardando…" : "Confirmar cambio"}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-[var(--color-text-2)]">
        Nuevo estado: <span className="font-medium text-[var(--color-text-1)]">{targetLabel}</span>
      </p>

      <label className="mt-4 block space-y-1.5">
        <span className="text-label">{commentLabel}</span>
        <textarea
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          rows={4}
          className={cn(
            "w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-1)]",
            "placeholder:text-[var(--color-text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]",
          )}
          placeholder={commentPlaceholder}
          autoFocus
        />
        <span className="text-caption text-[var(--color-text-3)]">{comment.trim().length} caracteres</span>
      </label>

      {error ? (
        <p className="mt-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-xs text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
    </ModalShell>
  );
}
