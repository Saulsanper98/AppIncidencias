"use client";

import { useEffect, useLayoutEffect } from "react";

import { entryDisplayTitle, type BitacoraEntry } from "@/lib/bitacora-shared";

function syncCrumb(entry: BitacoraEntry) {
  const title = entryDisplayTitle(entry);
  try {
    sessionStorage.setItem("ccmgc_bitacora_crumb", JSON.stringify({ id: entry.id, title }));
    window.dispatchEvent(new CustomEvent("ccmgc-bitacora-breadcrumb"));
  } catch {
    /* ignore */
  }
}

/** Sincroniza el título de la entrada activa con el breadcrumb del layout. */
export function BitacoraEntryCrumbSync({ entry }: { entry: BitacoraEntry }) {
  useLayoutEffect(() => {
    syncCrumb(entry);
  }, [entry.id, entry.title, entry.contentJson]);

  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem("ccmgc_bitacora_crumb");
        window.dispatchEvent(new CustomEvent("ccmgc-bitacora-breadcrumb"));
      } catch {
        /* ignore */
      }
    };
  }, []);

  return null;
}
