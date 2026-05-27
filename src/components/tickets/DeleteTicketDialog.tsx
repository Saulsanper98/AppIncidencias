"use client";

import { Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const MIN_REASON_LENGTH = 5;
const MAX_REASON_LENGTH = 500;

type DeleteTicketDialogProps = {
  /** Identificador interno del ticket; usado en la llamada DELETE. */
  ticketId: string | null;
  /** Etiqueta breve (id corto + t?tulo) para confirmar al usuario qu? borra. */
  ticketLabel?: string;
  /** Callback tras un borrado correcto (con el id devuelto por la API). */
  onDeleted: (deletedId: string) => void;
  /** Cerrar sin borrar. */
  onClose: () => void;
};

/**
 * Di?logo de confirmaci?n para eliminar un ticket.
 *
 * El motivo es obligatorio (validado en cliente y en servidor) y se guarda
 * en el registro de auditor?a antes del borrado. Esto deja constancia de
 * qui?n borr? qu? y por qu?, incluso aunque el ticket ya no exista.
 */
export function DeleteTicketDialog({
  ticketId,
  ticketLabel,
  onDeleted,
  onClose,
}: DeleteTicketDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ticketId) {
      setReason("");
      setError(null);
      const t = setTimeout(() => textareaRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ticketId, submitting, onClose]);

  if (!ticketId) return null;
  if (typeof document === "undefined") return null;

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON_LENGTH;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (tooShort || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.message === "string" ? data.message : "No se pudo eliminar el ticket");
        setSubmitting(false);
        return;
      }
      onDeleted(typeof data?.deletedId === "string" ? data.deletedId : ticketId);
    } catch (err) {
      console.error("Error eliminando ticket:", err);
      setError("Error de red al eliminar el ticket");
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-ticket-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_64px_-20px_rgba(0,0,0,0.6)]"
      >
        <header className="flex items-start gap-3 border-b border-[var(--color-border)] bg-rose-500/10 px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-200">
            <Trash2 size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="delete-ticket-title" className="text-sm font-semibold text-[var(--color-text-1)]">
              Eliminar ticket
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-3)]">
              Esta acci?n no se puede deshacer. {ticketLabel ? <span className="font-medium text-[var(--color-text-2)]">{ticketLabel}</span> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="px-5 py-4">
          <label htmlFor="delete-ticket-reason" className="text-[12px] font-medium text-[var(--color-text-2)]">
            Motivo del borrado <span className="text-rose-300">*</span>
          </label>
          <p className="mt-0.5 text-[11.5px] text-[var(--color-text-3)]">
            Quedar? registrado en el historial de auditor?a junto a tu nombre.
          </p>
          <textarea
            id="delete-ticket-reason"
            ref={textareaRef}
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, MAX_REASON_LENGTH))}
            rows={4}
            placeholder="Ej.: Duplicado de #ABCD1234, ticket de prueba, error de captura..."
            className={cn(
              "mt-2 w-full resize-y rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:outline-none focus:ring-1",
              tooShort
                ? "border-[var(--color-border)] focus:border-[var(--color-accent)]/40 focus:ring-[var(--color-accent)]/30"
                : "border-rose-500/40 focus:border-rose-400/60 focus:ring-rose-400/40",
            )}
            disabled={submitting}
            required
            minLength={MIN_REASON_LENGTH}
            maxLength={MAX_REASON_LENGTH}
          />
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className={cn("text-[var(--color-text-3)]", tooShort && trimmed.length > 0 && "text-rose-300")}>
              {tooShort && trimmed.length > 0
                ? `Faltan ${MIN_REASON_LENGTH - trimmed.length} caracteres`
                : "M?nimo 5 caracteres"}
            </span>
            <span className="text-[var(--color-text-3)]">{reason.length}/{MAX_REASON_LENGTH}</span>
          </div>
          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200"
            >
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-5 py-3">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={tooShort || submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={14} aria-hidden />
            {submitting ? "Eliminando..." : "Eliminar ticket"}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
