import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--color-bg)] px-6 text-center">
      <h1 className="text-xl font-semibold text-[var(--color-text-1)]">Sin conexión</h1>
      <p className="max-w-md text-sm text-[var(--color-text-2)]">
        No hay red disponible. Comprueba la conexión y vuelve a intentarlo.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-accent)]"
      >
        Ir al panel
      </Link>
    </div>
  );
}
