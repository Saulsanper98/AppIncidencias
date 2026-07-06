import Link from "next/link";
import { MapPinned } from "lucide-react";

import { CcmgcLogo } from "@/components/ccmgc-logo";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";

export default function NotFound() {
  return (
    <div className="ccmgc-page-enter flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--color-bg)] px-4 py-12 text-center">
      <div className="ccmgc-stagger-in ccmgc-stagger-in-1">
        <CcmgcLogo className="mx-auto h-12 w-auto opacity-90" />
      </div>
      <div className="ccmgc-stagger-in ccmgc-stagger-in-2 max-w-md space-y-3">
        <SectionEyebrow pulse dotColor="var(--color-accent)">
          Error 404
        </SectionEyebrow>
        <h1 className="dashboard-hero-title text-[28px]">Ruta no encontrada</h1>
        <p className="text-sm text-[var(--color-text-3)]">
          La página que buscas no existe o ha sido movida. Comprueba la URL o vuelve al panel principal.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="ccmgc-stagger-in ccmgc-stagger-in-3 ccmgc-primary-cta inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm"
      >
        <MapPinned size={15} aria-hidden />
        Volver al dashboard
      </Link>
    </div>
  );
}
