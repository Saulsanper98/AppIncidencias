"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils";

const MIN_REASON_LENGTH = 5;
const MAX_REASON_LENGTH = 500;

type Props = {
  ticketId: string | null;
  ticketLabel?: string;
  onSubmitted: () => void;
  onClose: () => void;
};

/**
 * Solicitud de borrado para técnicos de campo. No elimina el ticket;
 * queda pendiente de aprobación por un gestor.
 */
export function RequestTicketDeletionDialog({ ticketId, ticketLabel, onSubmitted, onClose }: Props) {
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
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/deletion-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.message === "string" ? data.message : "No se pudo enviar la solicitud");
        setSubmitting(false);
        return;
      }
      onSubmitted();
    } catch (err) {
      console.error("Error solicitando borrado:", err);
      setError("Error de red al enviar la solicitud");
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
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-200">
            <Send size={16} aria-hidden />
          </span>
          <span>Solicitar eliminación</span>
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
            form="request-ticket-deletion-form"
            disabled={tooShort || submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={14} aria-hidden />
            {submitting ? "Enviando…" : "Enviar solicitud"}
          </button>
        </>
      }
    >
      <form id="request-ticket-deletion-form" onSubmit={handleSubmit}>
        <p className="text-[12px] leading-relaxed text-[var(--color-text-3)]">
          Un gestor del centro de control revisará tu solicitud antes de eliminar el ticket.
          {ticketLabel ? (
            <>
              {" "}
              <span className="font-medium text-[var(--color-text-2)]">{ticketLabel}</span>
            </>
          ) : null}
        </p>

        <label htmlFor="request-ticket-deletion-reason" className="mt-4 block text-[12px] font-medium text-[var(--color-text-2)]">
          Motivo <span className="text-amber-300">*</span>
        </label>
        <p className="mt-0.5 text-[11.5px] text-[var(--color-text-3)]">
          Explica por qué debe eliminarse (duplicado, error de captura, prueba…).
        </p>
        <textarea
          id="request-ticket-deletion-reason"
          ref={textareaRef}
          value={reason}
          onChange={(event) => setReason(event.target.value.slice(0, MAX_REASON_LENGTH))}
          rows={4}
          placeholder="Ej.: Ticket duplicado de #ABCD1234, creado por error en campo…"
          className={cn(
            "mt-2 w-full resize-y rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:outline-none focus:ring-1",
            "border-[var(--color-border)] focus:border-[var(--color-accent)]/40 focus:ring-[var(--color-accent)]/30",
          )}
          disabled={submitting}
          required
          minLength={MIN_REASON_LENGTH}
          maxLength={MAX_REASON_LENGTH}
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--color-text-3)]">
          <span className={cn(tooShort && trimmed.length > 0 && "text-amber-300")}>
            {tooShort && trimmed.length > 0
              ? `Faltan ${MIN_REASON_LENGTH - trimmed.length} caracteres`
              : "Mínimo 5 caracteres"}
          </span>
          <span>
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
