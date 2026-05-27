"use client";

/**
 * Sistema global de toasts (notificaciones efimeras).
 *
 * API:
 *   import { toast } from "@/components/toast-host";
 *
 *   toast.success("Cambios guardados");
 *   toast.error("No se pudo conectar", { description: "Detalles..." });
 *   toast.info("Borrador autoguardado");
 *
 * Se monta una sola vez en el layout privado. Cualquier componente del
 * cliente puede llamar a las funciones del API; no requiere context provider.
 */

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

type ToastTone = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
  description?: string;
  duration: number;
};

type ToastInput = {
  description?: string;
  duration?: number;
};

const listeners = new Set<(item: ToastItem) => void>();
let counter = 0;

function emit(tone: ToastTone, message: string, options?: ToastInput) {
  const item: ToastItem = {
    id: ++counter,
    tone,
    message,
    description: options?.description,
    duration: options?.duration ?? 4000,
  };
  for (const l of listeners) l(item);
}

export const toast = {
  success: (message: string, options?: ToastInput) => emit("success", message, options),
  error: (message: string, options?: ToastInput) => emit("error", message, options),
  warning: (message: string, options?: ToastInput) => emit("warning", message, options),
  info: (message: string, options?: ToastInput) => emit("info", message, options),
};

const ICON_MAP = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const COLOR_MAP: Record<ToastTone, { border: string; bar: string; iconColor: string }> = {
  success: {
    border: "border-[rgba(16,185,129,0.30)]",
    bar: "bg-[var(--color-success)]",
    iconColor: "text-[var(--color-success)]",
  },
  error: {
    border: "border-[rgba(239,68,68,0.30)]",
    bar: "bg-[var(--color-error)]",
    iconColor: "text-[var(--color-error)]",
  },
  warning: {
    border: "border-[rgba(245,158,11,0.30)]",
    bar: "bg-[var(--color-warning)]",
    iconColor: "text-[var(--color-warning)]",
  },
  info: {
    border: "border-[rgba(59,130,246,0.30)]",
    bar: "bg-[var(--color-accent)]",
    iconColor: "text-[var(--color-accent)]",
  },
};

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (item: ToastItem) => {
      setItems((prev) => [...prev.slice(-4), item]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, item.duration);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Notificaciones"
      className="pointer-events-none fixed bottom-4 right-4 z-[200] flex flex-col gap-2"
    >
      {items.map((item) => {
        const Icon = ICON_MAP[item.tone];
        const c = COLOR_MAP[item.tone];
        return (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto relative flex w-[min(360px,calc(100vw-2rem))] items-start gap-3 overflow-hidden rounded-xl border ${c.border} bg-[var(--color-surface)] px-3.5 py-3 shadow-2xl backdrop-blur-md ccmgc-toast-in`}
          >
            <span className={`absolute left-0 top-0 h-full w-[3px] ${c.bar}`} aria-hidden />
            <Icon size={16} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${c.iconColor}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-[var(--color-text-1)]">{item.message}</p>
              {item.description ? (
                <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--color-text-3)]">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
              aria-label="Cerrar notificacion"
              className="shrink-0 rounded-md p-0.5 text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
