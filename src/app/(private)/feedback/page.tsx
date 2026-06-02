import { AlertCircle, Lightbulb, MessageSquarePlus, TrendingUp } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FeedbackPageClient } from "@/components/feedback/FeedbackPageClient";
import { SectionTabs } from "@/components/ui/section-tabs";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export default async function FeedbackPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) {
    redirect("/login?auth=required&next=/feedback");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <SectionTabs preset="account" />

      {/* Hero header — el ancho ahora abarca toda la página (2 paneles abajo
       *  en lugar del antiguo max-w-2xl con solo el form). */}
      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
        style={{
          background:
            "radial-gradient(ellipse at 90% 0%, rgba(37,99,235,0.10) 0%, transparent 55%), var(--color-surface)",
        }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent-light)]">
            <MessageSquarePlus size={24} className="text-[var(--color-accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-[var(--color-text-1)]">
              Comparte tu opinión
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-2)]">
              Tu feedback nos ayuda a mejorar la app cada día. Cuéntanos ideas, errores
              o cualquier cosa que creas que podría funcionar mejor. Verás el estado de
              tus envíos a la derecha.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { icon: Lightbulb, label: "Ideas", color: "text-[#f59e0b]", bg: "bg-[rgba(245,158,11,0.1)]" },
            { icon: AlertCircle, label: "Errores", color: "text-[var(--color-error)]", bg: "bg-[var(--color-error-light)]" },
            { icon: TrendingUp, label: "Mejoras", color: "text-[var(--color-success)]", bg: "bg-[var(--color-success-light)]" },
          ].map(({ icon: Icon, label, color, bg }) => (
            <div key={label} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${bg}`}>
              <Icon size={15} className={color} />
              <span className={`text-xs font-medium ${color}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form + Mis envíos en grid responsive */}
      <FeedbackPageClient />

      <p className="text-center text-xs text-[var(--color-text-3)]">
        Tu feedback es confidencial. Solo el equipo de administración puede verlo.
      </p>
    </div>
  );
}
