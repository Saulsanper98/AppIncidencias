import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const baseControlClasses =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm text-[var(--color-text-1)] min-h-[44px] transition-all duration-150 placeholder:text-[var(--color-text-3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] [color-scheme:dark]";

/** Mismo “chrome” que MenuSelect (mapa): sombra interior, hover y color-scheme. Sin appearance-none (en Windows/Chromium deja el nativo en blanco o ilegible). */
const nativeSelectChromeClasses =
  "cursor-pointer font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors duration-150 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)] disabled:cursor-not-allowed disabled:opacity-50";

/** Clases para `<select>` nativos fuera de este módulo (Preflight de Tailwind anula fondo por defecto). */
export const ccmgcNativeSelectClassName = cn(baseControlClasses, nativeSelectChromeClasses);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(baseControlClasses, className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn(ccmgcNativeSelectClassName, className)} {...props} />;
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  wrapperClassName?: string;
};

export function Textarea({ label, className, wrapperClassName, ...props }: TextareaProps) {
  return (
    <div className={cn("w-full space-y-1.5", wrapperClassName)}>
      {label ? <label className="text-label block">{label}</label> : null}
      <textarea
        className={cn(
          "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]",
          "px-3 py-2 text-sm text-[var(--color-text-1)]",
          "placeholder:text-[var(--color-text-3)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
          "transition-all resize-none",
          className,
        )}
        {...props}
      />
    </div>
  );
}
