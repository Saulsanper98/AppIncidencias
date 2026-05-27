import Link from "next/link";

import { CcmgcLogo } from "@/components/ccmgc-logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--color-bg)] px-4 py-12 text-center">
      <CcmgcLogo className="h-12 w-auto opacity-90" />
      <div>
        <p className="text-eyebrow text-[var(--color-accent)]">Error 404</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[var(--color-text-1)]">Ruta no encontrada</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--color-text-3)]">
          La pagina que buscas no existe o ha sido movida. Comprueba la URL o vuelve al panel principal.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/20"
      >
        Volver al dashboard
      </Link>
    </div>
  );
}
