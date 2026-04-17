"use client";

import { AlertCircle, Loader2, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  LOGIN_LOCALE_STORAGE_KEY,
  detectBrowserLocale,
  emitLoginLocaleChanged,
  loginCopy,
  loginErrorMessage,
  type LoginLocale,
} from "@/app/login/login-i18n";
import { LoginUserListbox } from "@/components/login-user-listbox";
import { Button } from "@/components/ui/button";
import { isDevUserSelectorEnabled } from "@/lib/dev-auth";
import type { SessionUser, UserRole } from "@/lib/domain";
import { fetchJsonWithTimeout } from "@/lib/login-fetch-error";
import { playOptionalLoginSuccessChime } from "@/lib/login-success-chime";
import { safeInternalNextPath } from "@/lib/safe-next-path";
import { trackLoginEvent } from "@/lib/login-telemetry";
import { userRoleLabel } from "@/lib/user-role-labels";
import { cn } from "@/lib/utils";

const LAST_DEV_USER_KEY = "ccmgc_login_last_dev_user_id";
const LOGIN_HIGH_CONTRAST_KEY = "ccmgc_login_high_contrast";

type LocalUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

type ErrorSource = "bootstrap" | "login";

let usersModuleCache: { users: LocalUser[]; fetchedAt: number } | null = null;
const USERS_TTL_MS = 60_000;

function invalidateUsersCache() {
  usersModuleCache = null;
}

function parseApiMessage(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { message?: unknown };
    return typeof j.message === "string" ? j.message : null;
  } catch {
    return null;
  }
}

type AccessGatewayProps = {
  guestTicketsUrl?: string | null;
};

export function AccessGateway({ guestTicketsUrl = null }: AccessGatewayProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authRequired = searchParams.get("auth") === "required";
  const nextParam = searchParams.get("next");
  const nextPath = useMemo(() => safeInternalNextPath(nextParam), [nextParam]);

  const devSelector = isDevUserSelectorEnabled();

  const [locale, setLocale] = useState<LoginLocale>("es");
  const [highContrast, setHighContrast] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem(LOGIN_LOCALE_STORAGE_KEY);
    const next: LoginLocale = stored === "es" || stored === "en" ? stored : detectBrowserLocale();
    setLocale(next);
    emitLoginLocaleChanged(next);
    const contrastStored = localStorage.getItem(LOGIN_HIGH_CONTRAST_KEY);
    setHighContrast(contrastStored === "1");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (highContrast) {
      root.setAttribute("data-login-contrast", "high");
    } else {
      root.removeAttribute("data-login-contrast");
    }
  }, [highContrast]);

  useEffect(() => {
    trackLoginEvent("view_login", { devSelector, authenticated: Boolean(sessionUser), nextPath });
    // Solo al entrar en pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = useMemo(() => loginCopy(locale), [locale]);

  const setLocalePersist = useCallback((next: LoginLocale) => {
    setLocale(next);
    try {
      localStorage.setItem(LOGIN_LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    emitLoginLocaleChanged(next);
  }, []);

  const [users, setUsers] = useState<LocalUser[]>([]);
  const loginUserOptions = useMemo(
    () =>
      users.map((u) => ({
        value: u.id,
        label: `${u.name} (${userRoleLabel(u.role, locale)})`,
      })),
    [users, locale],
  );
  const [selectedUserId, setSelectedUserId] = useState("");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<ErrorSource | null>(null);
  const [ready, setReady] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [loggingIn, setLoggingIn] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [flashWelcome, setFlashWelcome] = useState<string | null>(null);

  const userPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const langEsRef = useRef<HTMLButtonElement>(null);
  const emptyListRetryRef = useRef<HTMLButtonElement>(null);
  const logoutDialogRef = useRef<HTMLDivElement>(null);
  const logoutCancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const formId = useId();

  const loadBootstrap = useCallback(async () => {
    setError(null);
    setErrorSource(null);
    setReady(false);

    const sessionRes = await fetchJsonWithTimeout<{ authenticated: boolean; user?: SessionUser }>(
      "/api/auth/session",
      { method: "GET", cache: "no-store", timeoutMs: 12_000 },
    );

    if (!sessionRes.ok) {
      setError(loginErrorMessage(locale, sessionRes.kind, t));
      setErrorSource("bootstrap");
      setReady(true);
      return;
    }

    if (sessionRes.data.authenticated && sessionRes.data.user) {
      setSessionUser(sessionRes.data.user);
      // Estado de carga inteligente: con sesión activa no bloqueamos con fetches no críticos.
      setReady(true);
      return;
    } else {
      setSessionUser(null);
    }

    if (!devSelector) {
      setUsers([]);
      setSelectedUserId("");
      setReady(true);
      return;
    }

    const now = Date.now();
    let usersList: LocalUser[];
    if (usersModuleCache && now - usersModuleCache.fetchedAt < USERS_TTL_MS) {
      usersList = usersModuleCache.users;
    } else {
      const usersRes = await fetchJsonWithTimeout<{ users: LocalUser[] }>("/api/users", {
        method: "GET",
        cache: "no-store",
        timeoutMs: 12_000,
      });
      if (!usersRes.ok) {
        setError(loginErrorMessage(locale, usersRes.kind, t));
        setErrorSource("bootstrap");
        setUsers([]);
        setSelectedUserId("");
        setReady(true);
        return;
      }
      usersList = usersRes.data.users;
      usersModuleCache = { users: usersList, fetchedAt: now };
    }

    setUsers(usersList);

    let initialId = "";
    if (usersList.length > 0) {
      try {
        const storedId = localStorage.getItem(LAST_DEV_USER_KEY);
        if (storedId && usersList.some((u) => u.id === storedId)) {
          initialId = storedId;
        }
      } catch {
        /* ignore */
      }
      if (!initialId) initialId = usersList[0].id;
      setSelectedUserId(initialId);
    } else {
      setSelectedUserId("");
    }

    setReady(true);
  }, [devSelector, locale, t]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap, bootstrapAttempt]);

  useEffect(() => {
    if (error) {
      retryRef.current?.focus();
      return;
    }
    if (!ready || loggingIn || flashWelcome) return;
    if (sessionUser) {
      primaryRef.current?.focus();
      return;
    }
    if (devSelector && users.length > 0) {
      userPickerTriggerRef.current?.focus();
      return;
    }
    if (devSelector && users.length === 0) {
      emptyListRetryRef.current?.focus();
      return;
    }
    if (!devSelector) {
      langEsRef.current?.focus();
      return;
    }
    primaryRef.current?.focus();
  }, [ready, sessionUser, devSelector, users.length, loggingIn, flashWelcome, error]);

  const persistLastDevUser = (userId: string) => {
    if (!devSelector) return;
    try {
      localStorage.setItem(LAST_DEV_USER_KEY, userId);
    } catch {
      /* ignore */
    }
  };

  const handleLogin = async () => {
    if (!devSelector || !selectedUserId || loggingIn) return;
    trackLoginEvent("click_login", { locale, devSelector, nextPath });
    setError(null);
    setErrorSource(null);
    setLoggingIn(true);
    persistLastDevUser(selectedUserId);

    const result = await fetchJsonWithTimeout<{ authenticated: boolean; user: SessionUser }>("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId }),
      timeoutMs: 12_000,
    });

    setLoggingIn(false);

    if (!result.ok) {
      const apiMsg = parseApiMessage(result.message);
      setError(apiMsg ?? loginErrorMessage(locale, result.kind, t));
      setErrorSource("login");
      trackLoginEvent("login_error_kind", { kind: result.kind, locale, devSelector, nextPath });
      return;
    }

    setSessionUser(result.data.user);
    trackLoginEvent("login_success", { locale, devSelector, nextPath, authenticated: true });
    const name = result.data.user.name;
    setFlashWelcome(t.welcomeBack(name));
    setAnnounce(t.sessionStarted(name));
    playOptionalLoginSuccessChime();
    const dest = nextPath ?? "/dashboard";
    window.setTimeout(() => {
      router.push(dest);
    }, 180);
  };

  const performLogout = async () => {
    setLogoutOpen(false);
    await fetchJsonWithTimeout("/api/auth/session", { method: "DELETE", timeoutMs: 12_000 });
    setSessionUser(null);
    invalidateUsersCache();
    setBootstrapAttempt((n) => n + 1);
  };

  const prefetchDashboard = () => {
    const dest = nextPath ?? "/dashboard";
    router.prefetch(dest);
    router.prefetch("/dashboard");
  };

  const destAfterLogin = nextPath ?? "/dashboard";

  const handleRetry = () => {
    const src = errorSource;
    setError(null);
    setErrorSource(null);
    if (src === "login") {
      void handleLogin();
    } else {
      invalidateUsersCache();
      setBootstrapAttempt((n) => n + 1);
    }
  };

  const handleRetryEmptyList = () => {
    invalidateUsersCache();
    setBootstrapAttempt((n) => n + 1);
  };

  const roleLine = sessionUser
    ? `${t.rolePrefix}: ${userRoleLabel(sessionUser.role, locale)}`
    : t.selectUserProtected;

  useEffect(() => {
    if (!logoutOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    window.setTimeout(() => logoutCancelRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setLogoutOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const root = logoutDialogRef.current;
      if (!root) return;
      const candidates = Array.from(
        root.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (candidates.length === 0) return;
      const first = candidates[0];
      const last = candidates[candidates.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previousFocusRef.current?.focus();
    };
  }, [logoutOpen]);

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      <section
        id="login-main"
        className={cn(
          "login-section rounded-xl outline-none",
        )}
        aria-busy={!ready}
        aria-labelledby={`${formId}-heading`}
      >
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <span className="login-secondary-text text-caption">{locale === "en" ? "Language" : "Idioma"}</span>
          <div className="login-segmented flex">
            <button
              ref={langEsRef}
              type="button"
              className={cn(
                "login-focusable login-segmented-item px-3 py-1 text-xs font-semibold transition-colors",
                locale === "es"
                  ? "bg-[color-mix(in_oklab,var(--color-surface-2)_88%,white)] text-[var(--color-text-1)] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.22)]"
                  : "text-[color-mix(in_oklab,var(--color-text-3)_70%,white)] hover:text-[var(--color-text-1)]",
              )}
              onClick={() => setLocalePersist("es")}
              aria-pressed={locale === "es"}
            >
              {t.langEs}
            </button>
            <button
              type="button"
              className={cn(
                "login-focusable login-segmented-item px-3 py-1 text-xs font-semibold transition-colors",
                locale === "en"
                  ? "bg-[color-mix(in_oklab,var(--color-surface-2)_88%,white)] text-[var(--color-text-1)] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.22)]"
                  : "text-[color-mix(in_oklab,var(--color-text-3)_70%,white)] hover:text-[var(--color-text-1)]",
              )}
              onClick={() => setLocalePersist("en")}
              aria-pressed={locale === "en"}
            >
              {t.langEn}
            </button>
          </div>
          <button
            type="button"
            aria-pressed={highContrast}
            className={cn(
              "login-focusable login-segmented-item px-2 text-[11px] font-semibold transition-colors",
              highContrast
                ? "bg-[color-mix(in_oklab,var(--color-accent)_28%,var(--color-surface-2))] text-[var(--color-text-1)]"
                : "bg-[var(--color-surface-2)]/30 text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
            )}
            title={t.contrast}
            onClick={() => {
              const next = !highContrast;
              setHighContrast(next);
              try {
                localStorage.setItem(LOGIN_HIGH_CONTRAST_KEY, next ? "1" : "0");
              } catch {
                /* ignore */
              }
            }}
          >
            {t.contrastShort}
          </button>
        </div>

        {authRequired && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-warning)_55%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-warning-light)_55%,transparent)] p-4 text-[15px] leading-snug text-[var(--color-text-1)]"
          >
            <Lock size={18} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden />
            <span>{t.authRequired}</span>
          </div>
        )}

        <div className="space-y-[var(--login-space-meta)]">
          <div className="login-meta-block items-center text-center">
            <p className="text-label tracking-wide text-[color-mix(in_oklab,var(--color-text-3)_72%,white)]">{t.operationalAccess}</p>
            <h2 id={`${formId}-heading`} className="text-subheading text-balance text-[var(--color-text-1)]">
              {sessionUser ? t.activeSession(sessionUser.name) : t.signInToManage}
            </h2>
            {sessionUser ? (
              <div className="inline-flex w-fit max-w-full items-center justify-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-success)_35%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-success-light)_44%,transparent)] px-3 py-1.5 text-[13px] font-medium text-[color-mix(in_oklab,var(--color-success)_66%,white)]">
                <ShieldCheck size={14} aria-hidden />
                <span>{roleLine}</span>
              </div>
            ) : (
              <p className="text-body text-pretty leading-relaxed text-[var(--color-text-2)]">{roleLine}</p>
            )}
            {flashWelcome ? (
              <p className="text-body text-pretty font-medium text-[var(--color-success)]" role="status">
                {flashWelcome}
              </p>
            ) : null}
          </div>

          {!devSelector ? (
            <div
              role="status"
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4 text-body leading-relaxed text-[var(--color-text-2)]"
            >
              <p className="font-medium text-[var(--color-text-1)]">{t.ssoTitle}</p>
              <p className="mt-2">{t.ssoBody}</p>
              <p className="mt-2 text-caption text-[var(--color-text-3)]">{t.ssoSupport}</p>
            </div>
          ) : sessionUser ? null : (
            <div className="flex w-full flex-col items-center text-center">
              <div className="w-full max-w-md space-y-3">
                <label
                  htmlFor="login-user-select"
                  className="block text-balance text-label tracking-wide text-[var(--color-text-3)]"
                >
                  {t.labelUser}
                </label>
                {!ready && users.length === 0 ? (
                  <div
                    className="h-12 w-full rounded-lg bg-[var(--color-surface-2)] motion-safe:animate-pulse"
                    aria-hidden
                  />
                ) : users.length === 0 && !error ? (
                  <div
                    role="status"
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-4 text-center"
                  >
                    <p className="text-subheading text-balance text-[var(--color-text-1)]">{t.emptyUsersTitle}</p>
                    <p className="mt-2 text-body text-pretty text-[var(--color-text-2)]">{t.emptyUsersBody}</p>
                    <Button
                      ref={emptyListRetryRef}
                      type="button"
                      variant="secondary"
                      className="mt-4 w-full"
                      onClick={handleRetryEmptyList}
                    >
                      {t.retry}
                    </Button>
                  </div>
                ) : users.length === 0 ? null : (
                  <LoginUserListbox
                    ref={userPickerTriggerRef}
                    id="login-user-select"
                    value={selectedUserId}
                    options={loginUserOptions}
                    onChange={(v) => {
                      setSelectedUserId(v);
                      persistLastDevUser(v);
                    }}
                    aria-describedby={users.length > 0 ? "login-user-hint" : undefined}
                  />
                )}
                {ready && users.length > 0 ? (
                  <p id="login-user-hint" className="login-secondary-text text-pretty leading-snug">
                    {t.devHint}
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {sessionUser ? (
            <div className="login-actions pt-1">
              <Button
                ref={primaryRef}
                type="button"
                size="lg"
                className="login-primary-cta login-focusable login-motion-transform w-full motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0"
                onClick={() => router.push(destAfterLogin)}
                onMouseEnter={prefetchDashboard}
                onFocus={prefetchDashboard}
              >
                {t.continueDashboard}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="login-focusable w-full rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-text-2)] transition-colors hover:border-[color-mix(in_oklab,var(--color-accent)_38%,var(--color-border-hover))] hover:bg-[color-mix(in_oklab,var(--color-accent-light)_36%,var(--color-surface-2))] hover:text-[var(--color-text-1)]"
                onClick={() => setLogoutOpen(true)}
              >
                {t.changeUser}
              </Button>
            </div>
          ) : (
            <form
              className="login-actions pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                void handleLogin();
              }}
            >
              {devSelector && users.length > 0 ? (
                <Button
                  ref={primaryRef}
                  type="submit"
                  size="lg"
                  className="login-primary-cta login-focusable login-motion-transform w-full motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0"
                  disabled={!ready || loggingIn}
                >
                  {loggingIn ? (
                    <>
                      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                      {t.signingIn}
                    </>
                  ) : (
                    t.signIn
                  )}
                </Button>
              ) : null}

              {guestTicketsUrl ? (
                <p className="text-center">
                  <Link
                    href={guestTicketsUrl}
                    className="text-sm text-[var(--color-accent)] underline-offset-4 transition-colors hover:text-[var(--color-accent-hover)] hover:underline"
                  >
                    {t.guestTickets}
                  </Link>
                </p>
              ) : null}

              {!ready && devSelector ? (
                <p className="login-secondary-text text-caption" role="status">
                  {t.ariaBusy}
                </p>
              ) : null}
            </form>
          )}
        </div>

        {error ? (
          <div className="flex flex-col gap-3 pt-1">
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-error)_50%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-error-light)_45%,transparent)] p-4 text-[15px] leading-snug text-[var(--color-text-1)]"
            >
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--color-error)]" aria-hidden />
              <span>{error}</span>
            </div>
            <Button ref={retryRef} type="button" variant="secondary" className="w-full" onClick={handleRetry}>
              {t.retry}
            </Button>
          </div>
        ) : null}
      </section>

      {logoutOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLogoutOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
            ref={logoutDialogRef}
            className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl"
          >
            <h3 id="logout-confirm-title" className="text-heading">
              {t.logoutConfirmTitle}
            </h3>
            <p className="mt-3 text-body text-[var(--color-text-2)]">{t.logoutConfirmBody}</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                ref={logoutCancelRef}
                type="button"
                variant="ghost"
                className="login-focusable"
                onClick={() => setLogoutOpen(false)}
              >
                {t.cancel}
              </Button>
              <Button type="button" variant="danger" className="login-focusable" onClick={() => void performLogout()}>
                {t.confirmLogout}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
