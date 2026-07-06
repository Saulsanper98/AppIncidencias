"use client";

import { Activity, Eye, MessageSquare, Monitor, Paperclip, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { CENTRAL_VIEWER_HINT, CENTRAL_VIEWER_LABEL } from "@/lib/central-viewer";

export function ReadOnlyHero({ userName }: { userName: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  const ss = now.getSeconds().toString().padStart(2, "0");
  const dateLong = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const lecturaMuro = pathname.startsWith("/lectura") && searchParams.get("muro") === "1";
  const muroHref = lecturaMuro ? "/lectura" : "/lectura?muro=1";

  return (
    <header
      className="ccmgc-hero ccmgc-stagger-in ccmgc-stagger-in-1 relative overflow-hidden rounded-2xl border border-[var(--color-border)] px-5 py-5 sm:px-7 sm:py-6"
      style={{ ["--hero-accent-operacion" as string]: "var(--hero-accent-lectura)" }}
    >
      <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--hero-accent-lectura)_14%,var(--color-surface))] ring-1 ring-[color-mix(in_oklab,var(--hero-accent-lectura)_35%,transparent)] shadow-lg shadow-[color-mix(in_oklab,var(--hero-accent-lectura)_12%,transparent)] sm:h-16 sm:w-16">
            <Eye size={28} className="text-[var(--hero-accent-lectura)]" strokeWidth={2.2} />
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-surface)] ring-2 ring-[var(--color-surface)]"
            >
              <span className="ccmgc-pulse-dot h-2 w-2 rounded-full bg-[var(--color-success)] ring-2 ring-[color-mix(in_oklab,var(--color-success)_30%,transparent)]" />
            </span>
          </div>

          <div className="min-w-0">
            <SectionEyebrow pulse dotColor="var(--hero-accent-lectura)">
              {CENTRAL_VIEWER_LABEL}
            </SectionEyebrow>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="dashboard-hero-title text-xl sm:text-[28px]">Lectura de incidencias</h1>
              <Badge variant="success" className="inline-flex items-center gap-1 uppercase tracking-widest">
                <Activity size={9} className="ccmgc-pulse-dot" aria-hidden />
                En vivo
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--color-text-2)] sm:text-[13.5px]">
              Bandeja en tiempo real para{" "}
              <strong className="font-semibold text-[var(--color-text-1)]">{userName}</strong>
              . Refresco automático cada 30 s. Pulsa un ticket para abrir el detalle y gestionar la incidencia.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Badge variant="info" className="inline-flex items-center gap-1">
                <MessageSquare size={10} aria-hidden />
                Comentar
              </Badge>
              <Badge variant="info" className="inline-flex items-center gap-1">
                <Paperclip size={10} aria-hidden />
                Adjuntar
              </Badge>
              <Badge variant="success" className="inline-flex items-center gap-1">
                <CheckCircle2 size={10} aria-hidden />
                Cerrar ticket
              </Badge>
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-text-3)]">{CENTRAL_VIEWER_HINT}</p>
          </div>
        </div>

        <div className="flex w-full shrink-0 items-center justify-end sm:w-auto">
          <div className="flex flex-col items-end gap-2">
            <Link
              href={muroHref}
              title={
                lecturaMuro
                  ? "Salir del modo muro"
                  : "Activar modo muro para videowall (oculta menú y cabecera)"
              }
              className="desvios-action-chip"
            >
              <Monitor size={13} strokeWidth={1.7} aria-hidden />
              {lecturaMuro ? "Salir muro" : "Modo muro"}
            </Link>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 px-4 py-2.5 text-right shadow-inner backdrop-blur">
              <div className="flex items-baseline justify-end gap-1">
                <p className="font-mono text-[36px] font-bold leading-none tracking-tight text-[var(--color-text-1)] tabular-nums sm:text-[42px]">
                  {hh}
                  <span className="ccmgc-pulse-dot mx-0.5 text-[var(--hero-accent-lectura)]">:</span>
                  {mm}
                </p>
                <p className="font-mono text-[13px] font-medium leading-none text-[var(--color-text-3)] tabular-nums">
                  :{ss}
                </p>
              </div>
              <p className="mt-1.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-3)]">
                {dateLong}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
