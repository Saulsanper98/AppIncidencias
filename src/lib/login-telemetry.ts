"use client";

type LoginEventName = "view_login" | "click_login" | "login_success" | "login_error_kind";

type LoginEventPayload = {
  locale?: string;
  kind?: string;
  authenticated?: boolean;
  nextPath?: string | null;
  devSelector?: boolean;
};

export function trackLoginEvent(name: LoginEventName, payload: LoginEventPayload = {}): void {
  if (typeof window === "undefined") return;
  const detail = {
    name,
    payload,
    ts: Date.now(),
  };
  window.dispatchEvent(new CustomEvent("ccmgc-login-metric", { detail }));
  const dataLayer = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
  if (Array.isArray(dataLayer)) {
    dataLayer.push({ event: name, ...payload });
  }
  if (process.env.NODE_ENV !== "production") {
    console.debug("[login-metric]", detail);
  }
}
