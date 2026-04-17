import fs from "fs";

const src = "c:/Users/sauls/Downloads/logo.svg";
const dest = "c:/Ticketing CCMGC/ccmgc-ticketing/src/components/ccmgc-logo.tsx";

let s = fs.readFileSync(src, "utf8");
s = s.replace(/fill="#FFEB66"/g, 'fill="currentColor"');
s = s.replace(/clip-path=/g, "clipPath=");
s = s.replace(/clip0_147_14/g, "ccmgcLogoClip");

const m = s.match(/<svg[\s\S]*<\/svg>/);
if (!m) throw new Error("no svg match");
let svg = m[0];
svg = svg.replace("<svg", '<svg className={svgClass}');

const header = `"use client";

import { cn } from "@/lib/utils";

export type CcmgcLogoProps = {
  className?: string;
  /** Sobre acento o fondos oscuros */
  variant?: "default" | "onAccent";
};

/** Logo CCMGC (SVG con currentColor para tema claro/oscuro). */
export function CcmgcLogo({ className, variant = "default" }: CcmgcLogoProps) {
  const svgClass = cn(
    "h-full w-full max-w-full object-contain object-left",
    variant === "onAccent" ? "text-white" : "text-[var(--color-text-1)]",
  );
  return (
    <span
      className={cn("inline-flex shrink-0 select-none", className)}
      role="img"
      aria-label="CCMGC, Centro de Control de la Movilidad de Gran Canaria"
    >
`;

const footer = `
    </span>
  );
}
`;

fs.writeFileSync(dest, header + svg + footer);
console.log("written", dest);
