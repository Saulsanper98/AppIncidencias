import { Mailbox, UserCog } from "lucide-react";

import type { DesvioOrigen } from "@/lib/desvios/types";
import { cn } from "@/lib/utils";

type Props = {
  origen: DesvioOrigen;
  size?: "sm" | "md";
  className?: string;
};

export function OrigenBadge({ origen, size = "md", className }: Props) {
  const sm = size === "sm";
  const Icon = origen === "EMAIL" ? Mailbox : UserCog;
  const palette =
    origen === "EMAIL"
      // Azul: lo trajo el poller automaticamente. Hace de marca visual del
      // canal "auto" para diferenciarlo de los manuales.
      ? "border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.12)] text-[var(--color-accent)]"
      : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium uppercase tracking-[0.04em]",
        sm ? "gap-1 px-1.5 py-0.5 text-[10px]" : "gap-1.5 px-2 py-0.5 text-[11px]",
        palette,
        className,
      )}
      title={origen === "EMAIL" ? "Creado automaticamente desde el correo del jefe de sala" : "Creado manualmente por un operador"}
    >
      <Icon size={sm ? 10 : 12} strokeWidth={2} aria-hidden />
      {origen === "EMAIL" ? "Auto" : "Manual"}
    </span>
  );
}
