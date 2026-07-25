"use client";

import { FeedbackForm, type FeedbackPrefillTarget } from "@/components/feedback/FeedbackForm";
import { ModalShell } from "@/components/ui/modal-shell";

type Props = {
  /** Si true, el modal se muestra (con o sin `target`). */
  open: boolean;
  /**
   * Si se pasa un target el form aparece con un banner "Feedback sobre: X".
   * Si es null, se abre como modal genérico (lo usa el FAB / atajo global).
   */
  target?: FeedbackPrefillTarget | null;
  onClose: () => void;
};

export function FeedbackModal({ open, target, onClose }: Props) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Enviar feedback"
      className="max-w-lg"
    >
      <div className="max-h-[80dvh] overflow-y-auto">
        <FeedbackForm prefillTarget={target ?? undefined} onSuccess={onClose} />
      </div>
    </ModalShell>
  );
}
