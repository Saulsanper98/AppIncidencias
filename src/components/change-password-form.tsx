"use client";

import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  userName: string;
  userEmail: string;
  forced: boolean;
  nextPath: string | null;
};

export function ChangePasswordForm({ userName, userEmail, forced, nextPath }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [shakeField, setShakeField] = useState<"current" | "new" | "confirm" | null>(null);

  const mismatch = useMemo(() => confirm.length > 0 && confirm !== next, [confirm, next]);
  const tooShort = next.length > 0 && next.length < 10;
  const missingClasses = next.length > 0 && (!/[A-Za-zÀ-ÿ]/.test(next) || !/\d/.test(next));

  const canSubmit = current.length > 0 && next.length >= 10 && !mismatch && !missingClasses && !loading;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      const field = mismatch ? "confirm" : tooShort || missingClasses ? "new" : "current";
      setShakeField(field);
      window.setTimeout(() => setShakeField(null), 400);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data: { ok?: boolean; message?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "No se pudo cambiar la contraseña.");
        return;
      }
      setDone(true);
      const dest = nextPath ?? "/dashboard";
      window.setTimeout(() => router.push(dest), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <KeyRound size={20} className="text-[var(--color-accent)]" aria-hidden />
          <h1 className="text-heading text-[var(--color-text-1)]">
            {forced ? "Establece tu contraseña" : "Cambiar contraseña"}
          </h1>
        </div>
        <p className="text-body text-[var(--color-text-2)]">
          {forced
            ? "Tu cuenta usa una contraseña temporal. Elige una definitiva para continuar."
            : "Indica tu contraseña actual y la nueva."}
        </p>
        <p className="text-caption text-[var(--color-text-3)]">
          {userName} · {userEmail}
        </p>
      </header>

      <div>
        <label htmlFor="cp-current" className="mb-1.5 block text-label tracking-wide text-[var(--color-text-3)]">
          {forced ? "Contraseña temporal recibida" : "Contraseña actual"}
        </label>
        <input
          id="cp-current"
          type={showAll ? "text" : "password"}
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-body text-[var(--color-text-1)] focus:border-[color-mix(in_oklab,var(--color-accent)_60%,var(--color-border))] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]",
            shakeField === "current" && "ccmgc-input-error",
          )}
        />
      </div>

      <div>
        <label htmlFor="cp-new" className="mb-1.5 block text-label tracking-wide text-[var(--color-text-3)]">
          Nueva contraseña
        </label>
        <input
          id="cp-new"
          type={showAll ? "text" : "password"}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-body text-[var(--color-text-1)] focus:border-[color-mix(in_oklab,var(--color-accent)_60%,var(--color-border))] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]",
            shakeField === "new" && "ccmgc-input-error",
          )}
        />
        <p className="mt-1 text-caption text-[var(--color-text-3)]">
          Mínimo 10 caracteres, incluyendo letras y dígitos.
        </p>
        {tooShort ? <p className="mt-1 text-caption text-[var(--color-warning)]">Mínimo 10 caracteres.</p> : null}
        {missingClasses ? (
          <p className="mt-1 text-caption text-[var(--color-warning)]">Debe incluir al menos una letra y un dígito.</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="cp-confirm" className="mb-1.5 block text-label tracking-wide text-[var(--color-text-3)]">
          Confirmar nueva contraseña
        </label>
        <input
          id="cp-confirm"
          type={showAll ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-body text-[var(--color-text-1)] focus:border-[color-mix(in_oklab,var(--color-accent)_60%,var(--color-border))] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]",
            shakeField === "confirm" && "ccmgc-input-error",
          )}
        />
        {mismatch ? (
          <p className="mt-1 text-caption text-[var(--color-error)]">Las contraseñas no coinciden.</p>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-caption text-[var(--color-text-3)]">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Mostrar contraseñas
      </label>

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-[var(--color-error)]/40 bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}
      {done ? (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success-light)] px-3 py-2 text-sm text-[var(--color-success)]">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Contraseña actualizada. Redirigiendo…</span>
        </div>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
        {loading ? (
          <>
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> Guardando…
          </>
        ) : (
          "Guardar y continuar"
        )}
      </Button>
    </form>
  );
}
