"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Barra fina superior al navegar (Ola 4 #570). */
export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
    setActive(true);
    const t = window.setTimeout(() => setActive(false), 450);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (href.startsWith("http") && !href.startsWith(window.location.origin)) return;
      const path = href.startsWith("http") ? new URL(href).pathname : href.split("?")[0] ?? href;
      if (path !== pathnameRef.current) setActive(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!active) return null;

  return (
    <div
      className="navigation-progress-bar pointer-events-none fixed left-0 right-0 top-0 z-[300] h-[2px] origin-left bg-gradient-to-r from-[var(--color-accent)] to-[var(--hero-accent-conocimiento)]"
      role="presentation"
      aria-hidden
    />
  );
}
