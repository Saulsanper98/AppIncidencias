"use client";

import { useEffect, useState } from "react";

import {
  LOGIN_LOCALE_CHANGED_EVENT,
  LOGIN_LOCALE_STORAGE_KEY,
  detectBrowserLocale,
  type LoginLocale,
} from "@/app/login/login-i18n";

export function useLoginLocale(): LoginLocale {
  const [locale, setLocale] = useState<LoginLocale>("es");

  useEffect(() => {
    const apply = () => {
      const stored = localStorage.getItem(LOGIN_LOCALE_STORAGE_KEY);
      if (stored === "es" || stored === "en") {
        setLocale(stored);
        return;
      }
      setLocale(detectBrowserLocale());
    };
    apply();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOGIN_LOCALE_STORAGE_KEY) apply();
    };
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<LoginLocale>;
      if (ce.detail === "es" || ce.detail === "en") setLocale(ce.detail);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(LOGIN_LOCALE_CHANGED_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LOGIN_LOCALE_CHANGED_EVENT, onCustom as EventListener);
    };
  }, []);

  return locale;
}
