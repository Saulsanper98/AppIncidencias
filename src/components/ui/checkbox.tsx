"use client";

import { Check, Minus } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Clases en el contenedor externo (tamaño, márgenes). */
  wrapperClassName?: string;
};

/**
 * Checkbox alineado al tema (fondo oscuro, borde, acento al marcar / indeterminado).
 * El `ref` apunta al `<input type="checkbox">` (p. ej. para `indeterminate` imperativo).
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, wrapperClassName, disabled, ...props },
  ref,
) {
  return (
    <span className={cn("relative inline-flex h-4 w-4 shrink-0 align-middle", wrapperClassName)}>
      <input
        ref={ref}
        type="checkbox"
        disabled={disabled}
        className={cn(
          "peer absolute inset-0 z-[1] m-0 h-full w-full cursor-pointer opacity-0",
          "disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none relative flex h-4 w-4 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] transition-[background-color,border-color,box-shadow]",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-accent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--color-bg)]",
          "peer-checked:border-[var(--color-accent)] peer-checked:bg-[var(--color-accent)]",
          "peer-indeterminate:border-[var(--color-accent)] peer-indeterminate:bg-[var(--color-accent)]",
          "peer-disabled:opacity-40",
          "[&_.ccmgc-checkbox-check]:opacity-0 [&_.ccmgc-checkbox-ind]:opacity-0",
          "peer-checked:[&_.ccmgc-checkbox-check]:opacity-100",
          "peer-indeterminate:[&_.ccmgc-checkbox-check]:opacity-0",
          "peer-indeterminate:[&_.ccmgc-checkbox-ind]:opacity-100",
        )}
      >
        <Check
          strokeWidth={3}
          className="ccmgc-checkbox-check absolute h-3 w-3 text-white transition-opacity"
          aria-hidden
        />
        <Minus
          strokeWidth={2.5}
          className="ccmgc-checkbox-ind absolute h-3 w-3 text-white transition-opacity"
          aria-hidden
        />
      </span>
    </span>
  );
});
