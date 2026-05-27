import type { LoginFetchKind } from "@/lib/login-fetch-error";

export type LoginLocale = "es" | "en";

export const LOGIN_LOCALE_STORAGE_KEY = "ccmgc_login_locale";

export const LOGIN_LOCALE_CHANGED_EVENT = "ccmgc-login-locale-changed";

export function emitLoginLocaleChanged(locale: LoginLocale) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOGIN_LOCALE_CHANGED_EVENT, { detail: locale }));
}

export function detectBrowserLocale(): LoginLocale {
  if (typeof navigator === "undefined") return "es";
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of langs) {
    if (l.toLowerCase().startsWith("en")) return "en";
    if (l.toLowerCase().startsWith("es")) return "es";
  }
  return "es";
}

export function loginCopy(locale: LoginLocale) {
  const isEn = locale === "en";
  return {
    skipToContent: isEn ? "Skip to content" : "Ir al contenido",
    heroTitle: isEn ? "Control Center" : "Centro de Control",
    heroLead: isEn ? "Incident management · Gran Canaria" : "Gestión de incidencias · Gran Canaria",
    langEs: "ES",
    langEn: "EN",
    contrast: isEn ? "High contrast" : "Alto contraste",
    contrastShort: isEn ? "HC" : "AC",
    title: isEn ? "Sign in" : "Iniciar sesión",
    subtitle: isEn
      ? "Gran Canaria mobility control center"
      : "Centro de control de movilidad de Gran Canaria",
    devHint: isEn
      ? "Development mode: choose a simulated user. In production, standard authentication applies."
      : "Modo desarrollo: elige un usuario simulado. En producción se usará el flujo de autenticación estándar.",
    labelUser: isEn ? "User" : "Usuario",
    hintUser: isEn ? "Select who you are simulating in this environment." : "Selecciona quién simulas en este entorno.",
    emptyUsersTitle: isEn ? "No users available" : "No hay usuarios disponibles",
    emptyUsersBody: isEn
      ? "There are no active user accounts in the database. With an empty User table the app seeds demo users on startup; if every account was deactivated, re-enable one in Admin."
      : "No hay usuarios activos en la base de datos. Si la tabla de usuarios está vacía, la app crea cuentas de demostración al arrancar; si todos están desactivados, reactívalo desde Administración.",
    retry: isEn ? "Retry" : "Reintentar",
    signingIn: isEn ? "Signing in…" : "Entrando…",
    signIn: isEn ? "Sign in" : "Iniciar sesión",
    continueDashboard: isEn ? "Continue to dashboard" : "Continuar al dashboard",
    changeUser: isEn ? "Switch user" : "Cambiar de usuario",
    logoutConfirmTitle: isEn ? "Sign out?" : "¿Cerrar sesión?",
    logoutConfirmBody: isEn
      ? "You will leave the session on this device. Sensitive environments should confirm this action."
      : "Saldrás de la sesión en este dispositivo. En entornos con datos sensibles conviene confirmar.",
    cancel: isEn ? "Cancel" : "Cancelar",
    confirmLogout: isEn ? "Sign out" : "Cerrar sesión",
    guestTickets: isEn ? "View tickets as guest" : "Ver tickets como visitante",
    guestTicketsHint: isEn
      ? "Tickets require a session; this link is shown only when a public route exists."
      : "Los tickets requieren sesión; este enlace solo aplica si existe ruta pública.",
    legal: isEn ? "Legal notice" : "Aviso legal",
    support: isEn ? "Support" : "Soporte",
    envStaging: isEn ? "Staging" : "Staging",
    envProd: isEn ? "Production" : "Producción",
    envDev: isEn ? "Development" : "Desarrollo",
    ariaBusy: isEn ? "Loading sign-in options" : "Cargando opciones de acceso",
    sessionStarted: (name: string) =>
      isEn ? `Signed in as ${name}. Redirecting…` : `Sesión iniciada como ${name}. Redirigiendo…`,
    welcomeBack: (name: string) =>
      isEn ? `Welcome back, ${name}.` : `Hola de nuevo, ${name}.`,
    authRequired: isEn
      ? "You need to sign in to access the ticket inbox."
      : "Necesitas iniciar sesión para acceder a la bandeja de tickets.",
    operationalAccess: isEn ? "Operational access" : "Acceso operativo",
    activeSession: (name: string) => (isEn ? `Active session: ${name}` : `Sesión activa: ${name}`),
    signInToManage: isEn ? "Sign in to manage tickets" : "Inicia sesión para gestionar tickets",
    rolePrefix: isEn ? "Role" : "Rol",
    selectUserProtected: isEn
      ? "Choose a user to enter the protected module."
      : "Selecciona un usuario para entrar al módulo protegido.",
    ssoTitle: isEn ? "Corporate sign-in" : "Acceso corporativo",
    ssoBody: isEn
      ? "This deployment uses standard identity (SSO / OAuth). The development user selector is hidden."
      : "Este despliegue usa el sistema de identidad corporativo (SSO / OAuth). El selector de usuario de desarrollo está oculto.",
    ssoSupport: isEn
      ? "If you need access, contact your IT administrator or operations center."
      : "Si necesitas acceso, contacta con administración TI o el centro de operaciones.",
    fieldEmailLabel: isEn ? "Email address" : "Correo electrónico",
    fieldEmailPlaceholder: isEn ? "you@movilidadgc.org" : "tu@movilidadgc.org",
    fieldPasswordLabel: isEn ? "Password" : "Contraseña",
    fieldPasswordPlaceholder: isEn ? "Your password" : "Tu contraseña",
    showPassword: isEn ? "Show" : "Mostrar",
    hidePassword: isEn ? "Hide" : "Ocultar",
    forgotPassword: isEn ? "Forgot your password? Ask an administrator to reset it." : "¿Olvidaste tu contraseña? Pide a un administrador que la restablezca.",
    accessFootnote: isEn
      ? "If you don't have an account, ask the control center manager to create one for you."
      : "Si no tienes cuenta, pide al gestor del centro de control que te dé de alta.",
    selectorHint: isEn
      ? "Select your name in the list and type your password."
      : "Selecciona tu nombre de la lista y escribe tu contraseña.",
    errorInvalidCredentials: isEn ? "Incorrect user or password." : "Usuario o contraseña incorrectos.",
    errorPasswordRequired: isEn ? "Type your password." : "Escribe tu contraseña.",
    mustChangePasswordTitle: isEn ? "Set a new password" : "Establece una nueva contraseña",
    mustChangePasswordBody: isEn
      ? "Your account uses a temporary password. Please choose a permanent one to continue."
      : "Tu cuenta tiene una contraseña temporal. Establece una definitiva para continuar.",
    fieldCurrentPasswordLabel: isEn ? "Current password" : "Contraseña actual",
    fieldNewPasswordLabel: isEn ? "New password" : "Nueva contraseña",
    fieldNewPasswordConfirmLabel: isEn ? "Confirm new password" : "Confirmar nueva contraseña",
    passwordsDontMatch: isEn ? "The passwords don't match." : "Las contraseñas no coinciden.",
    passwordRulesHint: isEn
      ? "At least 10 characters, including letters and digits."
      : "Mínimo 10 caracteres, incluyendo letras y dígitos.",
    saveAndContinue: isEn ? "Save and continue" : "Guardar y continuar",
    passwordChanged: isEn ? "Password updated." : "Contraseña actualizada.",
    bootstrapFailed: isEn ? "We could not prepare sign-in." : "No se pudo preparar el acceso.",
    versionLabel: isEn ? "Version" : "Versión",
    envLabel: isEn ? "Environment" : "Entorno",
    envProductionValue: isEn ? "Production" : "Producción",
    envStagingValue: isEn ? "Staging" : "Staging",
    envDevelopmentValue: isEn ? "Development" : "Desarrollo",
    errors: {
      timeout: isEn
        ? "The request took too long. Check your network and try again."
        : "La petición tardó demasiado. Revisa la red e inténtalo de nuevo.",
      unauthorized: isEn
        ? "Invalid session or not authorized. Try signing in again."
        : "Sesión no válida o sin permiso. Vuelve a iniciar sesión.",
      server: isEn
        ? "The server returned an error. Try again in a few minutes."
        : "El servidor respondió con error. Inténtalo de nuevo en unos minutos.",
      network: isEn
        ? "Could not connect. Check your connection and try again."
        : "No se pudo conectar. Comprueba la conexión e inténtalo de nuevo.",
      parse: isEn ? "Unexpected response from server." : "Respuesta inesperada del servidor.",
    },
  } as const;
}

export function loginErrorMessage(
  _locale: LoginLocale,
  kind: LoginFetchKind,
  t: ReturnType<typeof loginCopy>,
): string {
  switch (kind) {
    case "timeout":
      return t.errors.timeout;
    case "unauthorized":
      return t.errors.unauthorized;
    case "network":
      return t.errors.network;
    case "parse":
      return t.errors.parse;
    case "server":
    default:
      return t.errors.server;
  }
}
