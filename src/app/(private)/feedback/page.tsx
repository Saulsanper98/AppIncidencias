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
import { KpiPill } from "@/components/ui/kpi-pill";
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
              <div className="ccmgc-eyebrow dashboard-pretitle">
                <span className="ccmgc-eyebrow-dot ccmgc-eyebrow-dot--pulse dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
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
              <KpiPill
                label="Mis envíos"
                value={counts.total}
                tone="accent"
                icon={<Inbox size={12} strokeWidth={1.9} />}
              />
              {counts.enRevision > 0 ? (
                <KpiPill
                  label="En revisión"
                  value={counts.enRevision}
                  tone="warning"
                  icon={<Clock size={12} strokeWidth={1.9} />}
                />
              ) : null}
              {counts.implementados > 0 ? (
                <KpiPill
                  label="Implementados"
                  value={counts.implementados}
                  tone="success"
                  icon={<CheckCircle2 size={12} strokeWidth={1.9} />}
                  title="Tus sugerencias que ya se han incorporado a la app"
                />
              ) : null}
              {counts.descartados > 0 ? (
                <KpiPill
                  label="Descartados"
                  value={counts.descartados}
                  tone="neutral"
                  icon={<XCircle size={12} strokeWidth={1.9} />}
                />
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
