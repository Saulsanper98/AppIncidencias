"use client";

import { List } from "lucide-react";
import { useEffect, useState } from "react";

import type { KbHeading } from "@/lib/kb-toc";

type Props = {
  headings: KbHeading[];
};

/**
 * Sidebar con la tabla de contenidos del articulo.
 *
 * Marca como activo el heading mas cercano al borde superior visible.
 * Usa IntersectionObserver con un margen negativo amplio para que el
 * cambio se anticipe levemente al scroll.
 */
export function ArticleToc({ headings }: Props) {
  const [active, setActive] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    if (headings.length === 0) return;
    const targets = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0.01 },
    );
    for (const t of targets) observer.observe(t);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav aria-label="Tabla de contenidos" className="ccmgc-card sticky top-16 hidden p-4 lg:block">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
        <List size={11} strokeWidth={1.7} aria-hidden /> {"En este art\u00EDculo"}
      </div>
      <ul className="space-y-0.5 text-[12.5px]">
        {headings.map((h) => {
          const isActive = active === h.id;
          const indent = h.depth === 2 ? "pl-3" : h.depth === 3 ? "pl-6" : "pl-0";
          return (
            <li key={h.id} className={indent}>
              <a
                href={`#${h.id}`}
                className={`block truncate rounded-sm border-l-2 px-2 py-1 transition-colors ${
                  isActive
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                    : "border-transparent text-[var(--color-text-3)] hover:border-[var(--color-border)] hover:text-[var(--color-text-1)]"
                }`}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
