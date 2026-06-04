"use client";

/**
 * ClientErrorBoundary — captura errores no controlados de React en producción
 * y los registra en UxEvent (`client_error`).
 *
 * Pensado para envolver el árbol del layout privado. Si algo explota en un
 * componente, en lugar de romper la app entera mostramos un fallback simple
 * y emitimos un evento de telemetría con stack y path para que el admin pueda
 * verlo agregado en /admin/analytics.
 *
 * Importante:
 *   - Es un componente CLIENT — necesita class component (Next no exporta
 *     hooks de error boundary todavía).
 *   - El fallback es discreto pero permite al usuario "recargar" sin perder
 *     toda la SPA.
 */

import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { trackUxEvent } from "@/lib/ux-telemetry";

type State = { hasError: boolean; message: string | null };

export class ClientErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      trackUxEvent("client_error", {
        message: error.message?.slice(0, 300) ?? null,
        stack: error.stack?.split("\n").slice(0, 6).join("\n") ?? null,
        component_stack: info.componentStack?.split("\n").slice(0, 6).join("\n") ?? null,
      });
    } catch {
      /* no podemos hacer nada si telemetría también falla */
    }
    // Log en consola para que el dev lo vea en vivo.
    console.error("ClientErrorBoundary captured:", error, info);
  }

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="max-w-md rounded-2xl border border-[var(--color-error)]/40 bg-[var(--color-error-light)] p-4 text-center sm:p-6">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-error)]/20">
              <AlertTriangle size={22} className="text-[var(--color-error)]" />
            </div>
            <h2 className="text-base font-semibold text-[var(--color-text-1)]">
              Algo no fue bien al pintar esta sección
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-2)]">
              El error se ha registrado para que el administrador lo revise.
              Puedes seguir trabajando recargando la página.
            </p>
            {this.state.message ? (
              <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-black/30 p-2 text-left text-[11px] text-[var(--color-text-3)]">
                {this.state.message}
              </pre>
            ) : null}
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
