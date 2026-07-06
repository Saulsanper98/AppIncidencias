"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ModalShell } from "@/components/ui/modal-shell";
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

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON_LENGTH;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ticketId || tooShort || submitting) return;
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

  return (
    <ModalShell
      open={Boolean(ticketId)}
      onClose={() => !submitting && onClose()}
      shake={Boolean(error)}
      maxWidth="28rem"
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-200">
            <Trash2 size={16} aria-hidden />
          </span>
          <span>Eliminar ticket</span>
        </span>
      }
      footer={
        <>
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
            form="delete-ticket-form"
            disabled={tooShort || submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={14} aria-hidden />
            {submitting ? "Eliminando..." : "Eliminar ticket"}
          </button>
        </>
      }
    >
      <form id="delete-ticket-form" onSubmit={handleSubmit}>
        <p className="text-[12px] text-[var(--color-text-3)]">
          Esta acci?n no se puede deshacer.{" "}
          {ticketLabel ? <span className="font-medium text-[var(--color-text-2)]">{ticketLabel}</span> : null}
        </p>

        <label htmlFor="delete-ticket-reason" className="mt-4 block text-[12px] font-medium text-[var(--color-text-2)]">
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
          <span className="text-[var(--color-text-3)]">
            {reason.length}/{MAX_REASON_LENGTH}
          </span>
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200"
          >
            {error}
          </p>
        ) : null}
      </form>
    </ModalShell>
  );
}
