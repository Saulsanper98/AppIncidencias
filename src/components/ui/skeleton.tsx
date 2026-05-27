/**
 * Bloque de loading con shimmer premium. Usa la clase `.ccmgc-skeleton`
 * definida en globals.css (animación reducida vía prefers-reduced-motion).
 *
 * Uso:
 *   <Skeleton className="h-4 w-24" />
 *   <Skeleton className="h-32 w-full rounded-xl" />
 */

import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ccmgc-skeleton", className)} aria-hidden {...rest} />;
}
