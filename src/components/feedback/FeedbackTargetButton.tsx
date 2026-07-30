"use client";

import { MessageSquarePlus } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  className?: string;
  /** `corner` = esquina superior derecha del panel (dashboard). */
  placement?: "inline" | "corner";
};

export function FeedbackTargetButton({ id, label, className, placement = "inline" }: Props) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
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
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-3)] transition-all duration-150",
        "opacity-40 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] hover:opacity-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
        placement === "corner" &&
          "absolute right-3 top-3 z-[2] border border-transparent bg-[var(--color-surface)]/80 backdrop-blur-sm hover:border-[color-mix(in_oklab,var(--color-accent)_25%,transparent)]",
        className,
      )}
    >
      <MessageSquarePlus size={13} strokeWidth={1.85} aria-hidden />
    </button>
  );
}
