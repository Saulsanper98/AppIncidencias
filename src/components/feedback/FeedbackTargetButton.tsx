"use client";

import { MessageSquarePlus } from "lucide-react";

type Props = {
  id: string;
  label: string;
  className?: string;
};

export function FeedbackTargetButton({ id, label, className }: Props) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent("ccmgc-open-feedback", {
        detail: { id, label },
      }),
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Enviar feedback sobre: ${label}`}
      aria-label={`Enviar feedback sobre ${label}`}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-3)] opacity-30 transition-all duration-150 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] hover:opacity-100 ${className ?? ""}`}
    >
      <MessageSquarePlus size={13} />
    </button>
  );
}
