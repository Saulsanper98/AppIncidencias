"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

/** Fade + slide sutil entre páginas privadas (w25 #183). */
export default function PrivateTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
    const main = document.querySelector("main");
    if (main) main.scrollTo({ top: 0, behavior });
    else window.scrollTo({ top: 0, behavior });
  }, [pathname]);

  return (
    <div key={pathname} className={cn("ccmgc-page-enter flex min-h-0 flex-1 flex-col")}>
      {children}
    </div>
  );
}
