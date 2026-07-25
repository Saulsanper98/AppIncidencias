import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionEyebrowProps = {
  children: ReactNode;
  pulse?: boolean;
  dotColor?: string;
  className?: string;
};

/** Eyebrow de sección con dot pulsante (Ola 4 #532). */
export function SectionEyebrow({ children, pulse = false, dotColor, className }: SectionEyebrowProps) {
  return (
    <p
      className={cn("ccmgc-eyebrow", className)}
      style={dotColor ? { ["--dot-color" as string]: dotColor } : undefined}
    >
      <span
        className={cn("ccmgc-eyebrow-dot", pulse && "ccmgc-eyebrow-dot--pulse")}
        aria-hidden
      />
      {children}
    </p>
  );
}
