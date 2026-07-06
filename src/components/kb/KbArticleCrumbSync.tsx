"use client";

import { useEffect } from "react";

/**
 * Sincroniza título del artículo KB con sessionStorage y el breadcrumb del shell (p18).
 */
export function KbArticleCrumbSync({ slug, title }: { slug: string; title: string }) {
  useEffect(() => {
    try {
      sessionStorage.setItem("ccmgc_kb_crumb", JSON.stringify({ slug, title }));
      window.dispatchEvent(new Event("ccmgc-kb-breadcrumb"));
    } catch {
      /* ignore */
    }
  }, [slug, title]);

  return null;
}
