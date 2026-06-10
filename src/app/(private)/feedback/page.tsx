import {
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquarePlus,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FeedbackPageClient } from "@/components/feedback/FeedbackPageClient";
import { SectionTabs } from "@/components/ui/section-tabs";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export default async function FeedbackPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) {
    redirect("/login?auth=required&next=/feedback");
  }

  // KPIs reales del usuario: total / en revision (pendiente + en_revision)
  // / implementados / descartados. Se calculan SSR para que el hero pinte
  // los numeros sin esperar al cliente.
  const myFeedbacks = await prisma.userFeedback.findMany({
    where: { userId },
    select: { status: true },
  });
  const counts = {
    total: myFeedbacks.length,
    enRevision: myFeedbacks.filter(
      (f) => f.status === "pendiente" || f.status === "en_revision",
    ).length,
    implementados: myFeedbacks.filter((f) => f.status === "implementado").length,
    descartados: myFeedbacks.filter((f) => f.status === "descartado").length,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <SectionTabs preset="account" />

      {/* Hero header premium con KPIs reales. */}
      <header
        className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6"
        style={{
          background:
            "radial-gradient(ellipse at 90% 0%, rgba(37,99,235,0.10) 0%, transparent 55%), var(--color-surface)",
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] ring-1 ring-[var(--color-accent)]/25">
              <MessageSquarePlus size={20} strokeWidth={1.7} className="text-[var(--color-accent)]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="dashboard-pretitle">
                <span className="dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
                CCMGC · Mi espacio
              </div>
              <h1 className="dashboard-hero-title mt-1 text-[22px] font-semibold leading-tight tracking-tight sm:text-[24px]">
                Comparte tu opinión
              </h1>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
                Tu feedback nos ayuda a mejorar la app cada día. Cuéntanos ideas, errores
                o cualquier cosa que creas que podría funcionar mejor. Verás el estado
                de tus envíos a la derecha.
              </p>
            </div>
          </div>

          {/* KPIs reales: solo se muestran cuando el usuario ya tiene historial. */}
          {counts.total > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="tickets-kpi-pill"
                style={{ ["--pill-tone" as string]: "var(--color-accent)" }}
              >
                <Inbox size={12} strokeWidth={1.9} />
                <span className="tickets-kpi-pill-value">{counts.total}</span>
                <span className="tickets-kpi-pill-label">Mis envíos</span>
              </span>
              {counts.enRevision > 0 ? (
                <span
                  className="tickets-kpi-pill"
                  style={{ ["--pill-tone" as string]: "var(--color-warning)" }}
                >
                  <Clock size={12} strokeWidth={1.9} />
                  <span className="tickets-kpi-pill-value">{counts.enRevision}</span>
                  <span className="tickets-kpi-pill-label">En revisión</span>
                </span>
              ) : null}
              {counts.implementados > 0 ? (
                <span
                  className="tickets-kpi-pill"
                  style={{ ["--pill-tone" as string]: "var(--color-success)" }}
                  title="Tus sugerencias que ya se han incorporado a la app"
                >
                  <CheckCircle2 size={12} strokeWidth={1.9} />
                  <span className="tickets-kpi-pill-value">{counts.implementados}</span>
                  <span className="tickets-kpi-pill-label">Implementados</span>
                </span>
              ) : null}
              {counts.descartados > 0 ? (
                <span
                  className="tickets-kpi-pill"
                  style={{ ["--pill-tone" as string]: "var(--color-text-3)" }}
                >
                  <XCircle size={12} strokeWidth={1.9} />
                  <span className="tickets-kpi-pill-value">{counts.descartados}</span>
                  <span className="tickets-kpi-pill-label">Descartados</span>
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2 text-[12px] text-[var(--color-text-3)]">
              <Sparkles size={13} className="text-[var(--color-accent)]" aria-hidden />
              <span>
                Aún no has enviado ningún feedback. ¡Estrena tu primera sugerencia abajo!
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Form + Mis envíos en grid responsive */}
      <FeedbackPageClient />

      <p className="text-center text-xs text-[var(--color-text-3)]">
        Tu feedback es confidencial. Solo el equipo de administración puede verlo.
      </p>
    </div>
  );
}
