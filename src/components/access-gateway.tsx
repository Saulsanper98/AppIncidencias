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
import { ModalShell } from "@/components/ui/modal-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { isDevUserSelectorEnabled } from "@/lib/dev-auth";
import type { SessionUser, UserRole } from "@/lib/domain";
import { fetchJsonWithTimeout } from "@/lib/login-fetch-error";
import { playOptionalLoginSuccessChime } from "@/lib/login-success-chime";
import { safeInternalNextPath } from "@/lib/safe-next-path";
import { trackLoginEvent } from "@/lib/login-telemetry";
import { userRoleLabel } from "@/lib/user-role-labels";
import { cn } from "@/lib/utils";

const LAST_USER_KEY = "ccmgc_login_last_user_id";
/** Clave legacy (dev); se migra a LAST_USER_KEY al leer. */
const LAST_USER_KEY_LEGACY = "ccmgc_login_last_dev_user_id";
const LOGIN_HIGH_CONTRAST_KEY = "ccmgc_login_high_contrast";

function readLastUserId(): string | null {
  try {
    const current = localStorage.getItem(LAST_USER_KEY);
    if (current) return current;
    const legacy = localStorage.getItem(LAST_USER_KEY_LEGACY);
    if (legacy) {
      localStorage.setItem(LAST_USER_KEY, legacy);
      localStorage.removeItem(LAST_USER_KEY_LEGACY);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeLastUserId(userId: string) {
  if (!userId) return;
  try {
    localStorage.setItem(LAST_USER_KEY, userId);
    localStorage.removeItem(LAST_USER_KEY_LEGACY);
  } catch {
    /* ignore */
  }
}

type LocalUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string | null;
  position?: string | null;
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

  const navigateAfterLogin = useCallback(
    (dest: string, delayMs = 180) => {
      const go = () => router.push(dest);
      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        go();
        return;
      }
      window.setTimeout(() => {
        const stage = document.querySelector<HTMLElement>("[data-login-page]");
        if (stage) {
          stage.classList.add("login-stage--exiting");
        }
        window.setTimeout(go, 180);
      }, delayMs);
    },
    [router],
  );

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
        label: u.name,
        secondary: u.position?.trim() || userRoleLabel(u.role, locale),
        avatarUrl: u.avatarUrl ?? null,
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
  const [errorShake, setErrorShake] = useState(false);

  // Estado del campo de contraseña. El email ya no se introduce: el usuario
  // elige su nombre/avatar del selector y solo escribe la contraseña.
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const userPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const langEsRef = useRef<HTMLButtonElement>(null);
  const emptyListRetryRef = useRef<HTMLButtonElement>(null);
  const logoutCancelRef = useRef<HTMLButtonElement>(null);
  const formId = useId();

  useEffect(() => {
    if (!error) return;
    setErrorShake(true);
    const timer = window.setTimeout(() => setErrorShake(false), 420);
    return () => window.clearTimeout(timer);
  }, [error]);

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

    // Cargamos siempre la lista de usuarios: el login en LAN es modo selector +
    // contraseña para todos los roles.
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
        const storedId = readLastUserId();
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
  }, [locale, t]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap, bootstrapAttempt]);

  useEffect(() => {
    // Bootstrap: foco en Reintentar. Login: foco en contraseña (no re-POST ciego).
    if (error) {
      if (errorSource === "login") {
        passwordInputRef.current?.focus();
        passwordInputRef.current?.select?.();
      } else {
        retryRef.current?.focus();
      }
      return;
    }
    if (!ready || loggingIn || flashWelcome) return;
    if (sessionUser) {
      primaryRef.current?.focus();
      return;
    }
    if (users.length === 0) {
      emptyListRetryRef.current?.focus();
      return;
    }
    // Con el selector cargado, el foco va directo al campo de contraseña: el
    // usuario más habitual ya está autoseleccionado, solo le falta escribir.
    if (!devSelector || selectedUserId) {
      passwordInputRef.current?.focus();
      return;
    }
    userPickerTriggerRef.current?.focus();
  }, [ready, sessionUser, devSelector, users.length, loggingIn, flashWelcome, error, errorSource, selectedUserId]);

  const persistLastDevUser = (userId: string) => {
    writeLastUserId(userId);
  };

  const handleLogin = async () => {
    if (!selectedUserId || loggingIn) return;
    const password = passwordInput;
    // En modo dev (selector sin contraseña) se permite enviar sin password.
    // Fuera de ese modo, el backend exige contraseña: bloqueamos en cliente.
    if (!devSelector && !password) {
      setError(t.errorPasswordRequired);
      setErrorSource("login");
      return;
    }
    trackLoginEvent("click_login", { locale, devSelector, nextPath });
    setError(null);
    setErrorSource(null);
    setLoggingIn(true);
    persistLastDevUser(selectedUserId);

    const body: Record<string, string> = { userId: selectedUserId };
    if (password) body.password = password;

    const result = await fetchJsonWithTimeout<{
      authenticated: boolean;
      user: SessionUser & { mustChangePassword?: boolean };
    }>("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 12_000,
    });

    setLoggingIn(false);

    if (!result.ok) {
      const apiMsg = parseApiMessage(result.message);
      if (result.kind === "unauthorized") {
        setError(apiMsg ?? t.errorInvalidCredentials);
      } else {
        setError(apiMsg ?? loginErrorMessage(locale, result.kind, t));
      }
      setErrorSource("login");
      trackLoginEvent("login_error_kind", { kind: result.kind, locale, devSelector, nextPath });
      return;
    }

    setSessionUser(result.data.user);
    setPasswordInput("");
    trackLoginEvent("login_success", { locale, devSelector, nextPath, authenticated: true });
    const name = result.data.user.name;
    setAnnounce(t.sessionStarted(name));
    playOptionalLoginSuccessChime();

    if (result.data.user.mustChangePassword) {
      const dest = nextPath
        ? `/account/cambiar-password?next=${encodeURIComponent(nextPath)}`
        : "/account/cambiar-password";
      navigateAfterLogin(dest, 120);
      return;
    }

    setFlashWelcome(t.welcomeBack(name));
    const dest = nextPath ?? "/dashboard";
    navigateAfterLogin(dest, 180);
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
      // No reenviar las mismas credenciales: el usuario corrige la contraseña.
      passwordInputRef.current?.focus();
      passwordInputRef.current?.select?.();
      return;
    }
    invalidateUsersCache();
    setBootstrapAttempt((n) => n + 1);
  };

  const handleRetryEmptyList = () => {
    invalidateUsersCache();
    setBootstrapAttempt((n) => n + 1);
  };

  const roleLine = sessionUser
    ? `${t.rolePrefix}: ${userRoleLabel(sessionUser.role, locale)}`
    : t.selectUserProtected;

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      <section
        id="login-main"
        className={cn("login-section outline-none")}
        aria-busy={!ready}
        aria-labelledby={`${formId}-heading`}
      >
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="login-access-kicker">{t.operationalAccess}</p>
            <h2 id={`${formId}-heading`} className="login-access-title mt-1">
              {sessionUser ? t.activeSession(sessionUser.name) : t.signIn}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="login-segmented flex" role="group" aria-label={locale === "en" ? "Language" : "Idioma"}>
              <button
                ref={langEsRef}
                type="button"
                className={cn(
                  "login-focusable login-segmented-item px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  locale === "es"
                    ? "bg-[var(--color-surface-2)] text-[var(--color-text-1)] shadow-[inset_0_0_0_1px_var(--color-border)]"
                    : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
                )}
                onClick={() => setLocalePersist("es")}
                aria-pressed={locale === "es"}
              >
                {t.langEs}
              </button>
              <button
                type="button"
                className={cn(
                  "login-focusable login-segmented-item px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  locale === "en"
                    ? "bg-[var(--color-surface-2)] text-[var(--color-text-1)] shadow-[inset_0_0_0_1px_var(--color-border)]"
                    : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
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
              aria-label={t.contrastAria}
              title={t.contrast}
              className={cn(
                "login-focusable login-contrast-toggle min-h-11 min-w-11 rounded-xl border px-2.5 text-[11px] font-semibold transition-colors",
                highContrast
                  ? "border-[color-mix(in_oklab,var(--color-accent)_40%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-accent)_22%,var(--color-surface-2))] text-[var(--color-text-1)]"
                  : "border-[color-mix(in_oklab,var(--color-border)_88%,transparent)] bg-[color-mix(in_oklab,var(--color-surface-2)_70%,transparent)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
              )}
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
        </div>

        {authRequired && (
          <div
            role="status"
            className="mb-3 flex items-start gap-2 rounded-lg border border-[color-mix(in_oklab,var(--color-warning)_55%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-warning-light)_55%,transparent)] px-3 py-2 text-[13px] leading-snug text-[var(--color-text-1)]"
          >
            <Lock size={15} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden />
            <span>{t.authRequired}</span>
          </div>
        )}

        <div className="space-y-3">
          {sessionUser ? (
            <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-md border border-[color-mix(in_oklab,var(--color-success)_35%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-success-light)_44%,transparent)] px-2.5 py-1 text-[12px] font-medium text-[color-mix(in_oklab,var(--color-success)_66%,white)]">
              <ShieldCheck size={13} aria-hidden />
              <span>{roleLine}</span>
            </div>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-[var(--color-text-3)]">{t.selectUserProtected}</p>
          )}
          {flashWelcome ? (
            <p className="login-welcome-flash text-[13px] font-medium text-[var(--color-success)]" role="status">
              {flashWelcome}
            </p>
          ) : null}

          {sessionUser ? null : (
            <div className="space-y-3">
                {/* === Selector de usuario === */}
                <div>
                  <label
                    htmlFor="login-user-select"
                    className="mb-1 block text-label tracking-wide text-[var(--color-text-2)]"
                  >
                    {t.labelUser}
                  </label>
                  {!ready && users.length === 0 ? (
                    <Skeleton className="h-12 w-full rounded-lg" />
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
                      labels={{
                        accounts: t.listboxAccounts,
                        select: t.listboxSelect,
                        searchPlaceholder: t.listboxSearchPlaceholder,
                        clearSearch: t.listboxClearSearch,
                        noMatches: t.listboxNoMatches,
                      }}
                      onChange={(v) => {
                        setSelectedUserId(v);
                        persistLastDevUser(v);
                        if (errorSource === "login") {
                          setError(null);
                          setErrorSource(null);
                        }
                      }}
                      aria-describedby="login-user-hint"
                    />
                  )}
                </div>

                {/* === Campo contraseña === */}
                {users.length > 0 ? (
                  <div>
                    <label
                      htmlFor="login-password"
                      className="mb-1 block text-label tracking-wide text-[var(--color-text-2)]"
                    >
                      {t.fieldPasswordLabel}
                    </label>
                    <div className="relative">
                      <Lock
                        size={14}
                        aria-hidden
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
                        strokeWidth={1.8}
                      />
                      <input
                        ref={passwordInputRef}
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder={t.fieldPasswordPlaceholder}
                        value={passwordInput}
                        aria-invalid={errorSource === "login" && Boolean(error)}
                        aria-describedby={
                          errorSource === "login" && error
                            ? "login-error-msg login-user-hint"
                            : "login-user-hint"
                        }
                        onChange={(e) => {
                          setPasswordInput(e.target.value);
                          if (errorSource === "login") {
                            setError(null);
                            setErrorSource(null);
                          }
                        }}
                        className="login-focusable login-input-premium min-h-11 w-full rounded-lg py-2.5 pl-9 pr-[4.5rem] text-[13px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const el = passwordInputRef.current;
                          const start = el?.selectionStart ?? null;
                          const end = el?.selectionEnd ?? null;
                          setShowPassword((v) => !v);
                          window.requestAnimationFrame(() => {
                            const input = passwordInputRef.current;
                            if (!input || start == null || end == null) return;
                            try {
                              input.setSelectionRange(start, end);
                            } catch {
                              /* ignore */
                            }
                            input.focus();
                          });
                        }}
                        className="login-focusable login-password-toggle absolute right-1.5 top-1/2 flex min-h-9 min-w-[3.25rem] -translate-y-1/2 items-center justify-center rounded-md px-2 text-[11px] font-medium transition-colors hover:text-[var(--color-text-1)]"
                        aria-label={showPassword ? t.hidePassword : t.showPassword}
                      >
                        {showPassword ? t.hidePassword : t.showPassword}
                      </button>
                    </div>
                    <p id="login-user-hint" className="mt-1.5 text-[11px] leading-snug text-[var(--color-text-3)]">
                      {t.selectorHint}{" "}
                      <span className="opacity-85">{t.forgotPassword}</span>
                    </p>
                  </div>
                ) : null}
              </div>
          )}

          {sessionUser ? (
            <div className="login-actions">
              <Button
                ref={primaryRef}
                type="button"
                className="login-primary-cta login-primary-cta-premium login-focusable w-full"
                onClick={() => router.push(destAfterLogin)}
                onMouseEnter={prefetchDashboard}
                onFocus={prefetchDashboard}
              >
                {t.continueDashboard}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="login-focusable w-full !min-h-9 rounded-lg border border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
                onClick={() => setLogoutOpen(true)}
              >
                {t.changeUser}
              </Button>
            </div>
          ) : (
            <form
              className="login-actions"
              onSubmit={(e) => {
                e.preventDefault();
                void handleLogin();
              }}
            >
              {users.length > 0 ? (
                <Button
                  ref={primaryRef}
                  type="submit"
                  className="login-primary-cta login-primary-cta-premium login-focusable w-full"
                  disabled={
                    !ready ||
                    loggingIn ||
                    !selectedUserId ||
                    (!devSelector && !passwordInput)
                  }
                >
                  {loggingIn ? (
                    <span className="login-cta-loading inline-flex items-center gap-2">
                      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                      <span className="login-cta-loading__label">{t.signingIn}</span>
                    </span>
                  ) : (
                    t.signIn
                  )}
                </Button>
              ) : null}

              {guestTicketsUrl ? (
                <p className="text-center">
                  <Link
                    href={guestTicketsUrl}
                    className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/45 px-3 py-1.5 text-sm font-medium text-[var(--color-text-2)] transition-colors hover:border-[color-mix(in_oklab,var(--color-accent)_38%,var(--color-border-hover))] hover:bg-[color-mix(in_oklab,var(--color-accent-light)_36%,var(--color-surface-2))] hover:text-[var(--color-text-1)]"
                  >
                    {t.guestTickets}
                  </Link>
                </p>
              ) : null}

              {!ready ? (
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
              id="login-error-msg"
              role="alert"
              aria-live="assertive"
              className={cn(
                "flex items-start gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-error)_50%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-error-light)_45%,transparent)] p-4 text-[15px] leading-snug text-[var(--color-text-1)] transition-[border-color,box-shadow] duration-200",
                errorShake && "ccmgc-shake shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-error)_35%,transparent)]",
              )}
            >
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--color-error)]" aria-hidden />
              <span>{error}</span>
            </div>
            <Button ref={retryRef} type="button" variant="secondary" className="min-h-11 w-full" onClick={handleRetry}>
              {errorSource === "login" ? t.fixCredentials : t.retry}
            </Button>
          </div>
        ) : null}
      </section>

      <ModalShell
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        size="md"
        initialFocusRef={logoutCancelRef}
        title={t.logoutConfirmTitle}
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
        }
      >
        <p className="text-body text-[var(--color-text-2)]">{t.logoutConfirmBody}</p>
      </ModalShell>
    </>
  );
}
