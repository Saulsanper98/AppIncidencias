/** Clases semánticas (tokens CSS) para sustituir colores Tailwind sueltos. */
export const UIU_TONE = {
  error: {
    ring: "border-[color-mix(in_oklab,var(--color-error)_28%,transparent)]",
    bg: "bg-[linear-gradient(135deg,var(--color-error-light),transparent_55%)]",
    icon: "bg-[var(--color-error-light)] text-[var(--color-error)]",
    count: "text-[var(--color-error)]",
    glow: "from-[color-mix(in_oklab,var(--color-error)_14%,transparent)]",
    chip: "border-[color-mix(in_oklab,var(--color-error)_25%,transparent)] bg-[var(--color-error-light)] text-[var(--color-error)]",
  },
  warning: {
    ring: "border-[color-mix(in_oklab,var(--color-warning)_28%,transparent)]",
    bg: "bg-[linear-gradient(135deg,var(--color-warning-light),transparent_55%)]",
    icon: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
    count: "text-[var(--color-warning)]",
    glow: "from-[color-mix(in_oklab,var(--color-warning)_12%,transparent)]",
    chip: "border-[color-mix(in_oklab,var(--color-warning)_25%,transparent)] bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  },
  accent: {
    ring: "border-[color-mix(in_oklab,var(--color-accent)_25%,transparent)]",
    bg: "bg-[linear-gradient(135deg,var(--color-accent-light),transparent_55%)]",
    icon: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
    count: "text-[var(--color-accent)]",
    glow: "from-[color-mix(in_oklab,var(--color-accent)_10%,transparent)]",
    chip: "border-[color-mix(in_oklab,var(--color-accent)_25%,transparent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  },
} as const;
