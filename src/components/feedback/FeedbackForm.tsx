"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import type { FeedbackCategory, FeedbackType, FeedbackUrgency } from "@/lib/domain";

// ─── Options ───────────────────────────────────────────────────────────────────

const TYPES = [
  {
    value: "idea" as FeedbackType,
    label: "Idea nueva",
    description: "Propón una funcionalidad que te gustaría ver",
    icon: Lightbulb,
    color: "text-[#f59e0b]",
    iconBg: "bg-[rgba(245,158,11,0.14)]",
    idleBg: "bg-[rgba(245,158,11,0.05)]",
    idleBorder: "rgba(245,158,11,0.2)",
    activeBg: "rgba(245,158,11,0.14)",
    activeBorder: "rgba(245,158,11,0.7)",
    activeShadow: "rgba(245,158,11,0.15)",
  },
  {
    value: "error" as FeedbackType,
    label: "Reporte de error",
    description: "Algo no funciona como debería",
    icon: AlertCircle,
    color: "text-[var(--color-error)]",
    iconBg: "bg-[var(--color-error-light)]",
    idleBg: "bg-[var(--color-error-light)]/30",
    idleBorder: "rgba(220,38,38,0.2)",
    activeBg: "rgba(220,38,38,0.12)",
    activeBorder: "rgba(220,38,38,0.7)",
    activeShadow: "rgba(220,38,38,0.12)",
  },
  {
    value: "mejora" as FeedbackType,
    label: "Mejora",
    description: "Una función existente que podría ser mejor",
    icon: TrendingUp,
    color: "text-[var(--color-success)]",
    iconBg: "bg-[var(--color-success-light)]",
    idleBg: "bg-[var(--color-success-light)]/30",
    idleBorder: "rgba(5,150,105,0.2)",
    activeBg: "rgba(5,150,105,0.12)",
    activeBorder: "rgba(5,150,105,0.7)",
    activeShadow: "rgba(5,150,105,0.12)",
  },
] as const;

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "interfaz",      label: "Interfaz y diseño" },
  { value: "funcionalidad", label: "Funcionalidad" },
  { value: "rendimiento",   label: "Rendimiento" },
  { value: "documentacion", label: "Documentación" },
  { value: "otro",          label: "Otro" },
];

const URGENCIES = [
  { value: "baja"  as FeedbackUrgency, label: "Baja",  color: "#059669", bg: "rgba(5,150,105,0.14)",  border: "rgba(5,150,105,0.5)" },
  { value: "media" as FeedbackUrgency, label: "Media", color: "#d97706", bg: "rgba(217,119,6,0.14)",  border: "rgba(217,119,6,0.5)" },
  { value: "alta"  as FeedbackUrgency, label: "Alta",  color: "#dc2626", bg: "rgba(220,38,38,0.14)",  border: "rgba(220,38,38,0.5)" },
] as const;

const STAR_LABELS: Record<number, string> = {
  1: "Muy insatisfecho",
  2: "Insatisfecho",
  3: "Neutral",
  4: "Satisfecho",
  5: "Muy satisfecho",
};

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = "type" | "details" | "done";
type FormState = {
  type: FeedbackType | null;
  category: FeedbackCategory;
  title: string;
  description: string;
  rating: number | null;
  urgency: FeedbackUrgency;
};

const defaultForm = (): FormState => ({
  type: null, category: "funcionalidad",
  title: "", description: "", rating: null, urgency: "media",
});

export type FeedbackPrefillTarget = { id: string; label: string };

// ─── Star rating ───────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? value;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            aria-label={`${star} estrella${star > 1 ? "s" : ""}`}
            className="group flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] transition-all duration-150 hover:scale-110 hover:border-[rgba(245,158,11,0.5)] hover:bg-[rgba(245,158,11,0.1)]"
            style={active !== null && star <= active ? {
              background: "rgba(245,158,11,0.15)",
              borderColor: "rgba(245,158,11,0.5)",
              transform: "scale(1.08)",
            } : {}}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 transition-all duration-150"
              fill={active !== null && star <= active ? "#f59e0b" : "none"}
              stroke={active !== null && star <= active ? "#f59e0b" : "var(--color-text-3)"}
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
              />
            </svg>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {active !== null && (
          <motion.p key={active}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="text-xs text-[var(--color-text-2)]"
          >
            {STAR_LABELS[active]}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Form ──────────────────────────────────────────────────────────────────────

export function FeedbackForm({ prefillTarget, onSuccess }: {
  prefillTarget?: FeedbackPrefillTarget;
  onSuccess?: () => void;
}) {
  const pathname = usePathname();
  const rm = useReducedMotion();
  const [step, setStep] = useState<Step>("type");
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const selectedType = TYPES.find((t) => t.value === form.type);

  const handleSelectType = (type: FeedbackType) => {
    setForm((prev) => ({ ...prev, type }));
    setStep("details");
  };

  const validate = () => {
    const errors: Record<string, string[]> = {};
    if (!form.type) errors.type = ["Selecciona un tipo"];
    if (form.title.trim().length < 5) errors.title = ["Mínimo 5 caracteres"];
    if (form.description.trim().length < 15) errors.description = ["Mínimo 15 caracteres"];
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setError(null);
    setSubmitting(true);
    try {
      const currentPage = prefillTarget
        ? `${prefillTarget.label} [${prefillTarget.id}]`
        : (pathname ?? undefined);
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type, category: form.category,
          title: form.title.trim(), description: form.description.trim(),
          rating: form.rating, urgency: form.urgency, currentPage,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? "Error al enviar");
      }
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm(defaultForm());
    setFieldErrors({});
    setError(null);
    setStep("type");
    onSuccess?.();
  };

  const slideProps = rm ? {} : {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.22 },
  };

  // ── Success ──
  if (step === "done") {
    return (
      <motion.div key="done"
        initial={rm ? {} : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, type: "spring", stiffness: 220, damping: 22 }}
        className="flex flex-col items-center gap-5 py-10 text-center"
      >
        <motion.div
          initial={rm ? {} : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-success-light)]"
        >
          <CheckCircle2 size={44} className="text-[var(--color-success)]" />
        </motion.div>
        <div>
          <h2 className="text-xl font-semibold text-[var(--color-text-1)]">¡Gracias por tu feedback!</h2>
          <p className="mt-2 max-w-xs text-sm text-[var(--color-text-2)]">
            Tu aportación ha quedado registrada. El equipo la revisará próximamente.
          </p>
        </div>
        <button type="button" onClick={handleReset}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
        >
          <Sparkles size={15} />
          Enviar otro
        </button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Context target banner */}
      {prefillTarget && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-accent)]/20 bg-[var(--color-accent-light)] px-3 py-2">
          <MessageSquarePlus size={14} className="shrink-0 text-[var(--color-accent)]" />
          <p className="text-xs text-[var(--color-accent)]">
            Feedback sobre: <span className="font-semibold">{prefillTarget.label}</span>
          </p>
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--color-text-3)]">
            {step === "type" ? "Paso 1 de 2 · Tipo de feedback" : "Paso 2 de 2 · Detalles"}
          </p>
          {step === "details" && selectedType && (
            <button type="button" onClick={() => setStep("type")}
              className="flex items-center gap-1 text-xs text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-2)]"
            >
              <selectedType.icon size={11} className={selectedType.color} />
              <span>{selectedType.label}</span>
              <span className="opacity-60">· cambiar</span>
            </button>
          )}
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
            style={{ width: step === "type" ? "50%" : "100%" }}
          />
        </div>
      </div>

      {/* Steps */}
      <AnimatePresence mode="wait">

        {/* ── Step 1: Type ── */}
        {step === "type" && (
          <motion.div key="type" {...slideProps} className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-1)]">¿Qué quieres compartirnos?</h2>
              <p className="mt-0.5 text-sm text-[var(--color-text-2)]">Selecciona el tipo de feedback para empezar.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {TYPES.map(({ value, label, description, icon: Icon, color, iconBg, idleBorder, activeBg, activeBorder, activeShadow }) => {
                const isActive = form.type === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleSelectType(value)}
                    className="group flex flex-col gap-3.5 rounded-xl border-2 p-5 text-left transition-all duration-200"
                    style={isActive ? {
                      background: activeBg,
                      borderColor: activeBorder,
                      boxShadow: `0 0 0 4px ${activeShadow}`,
                    } : {
                      background: "var(--color-surface-2)",
                      borderColor: idleBorder,
                    }}
                  >
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBg} transition-transform duration-200 group-hover:scale-110`}>
                      <Icon size={22} className={color} />
                    </div>
                    <div>
                      <p className={`font-semibold ${color}`}>{label}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-3)]">{description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Details ── */}
        {step === "details" && (
          <motion.div key="details" {...slideProps} className="space-y-5">
            <div className="space-y-4">

              {/* Category */}
              <div className="space-y-2">
                <label className="text-label text-[var(--color-text-2)]">Categoría</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(({ value, label }) => (
                    <button key={value} type="button"
                      onClick={() => setForm((prev) => ({ ...prev, category: value }))}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                        form.category === value
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <label htmlFor="fb-title" className="text-label text-[var(--color-text-2)]">
                  Título <span className="text-[var(--color-error)]">*</span>
                </label>
                <input
                  id="fb-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, title: e.target.value }));
                    if (fieldErrors.title) setFieldErrors((p) => ({ ...p, title: [] }));
                  }}
                  placeholder="Resumen breve en una línea"
                  maxLength={150}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] transition-colors focus:border-[var(--color-accent)] focus:outline-none"
                />
                <div className="flex items-center justify-between">
                  {fieldErrors.title?.length ? (
                    <p className="text-xs text-[var(--color-error)]">{fieldErrors.title[0]}</p>
                  ) : <span />}
                  <p className="text-xs text-[var(--color-text-3)]">{form.title.length}/150</p>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label htmlFor="fb-description" className="text-label text-[var(--color-text-2)]">
                  Descripción <span className="text-[var(--color-error)]">*</span>
                </label>
                <textarea
                  id="fb-description"
                  value={form.description}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, description: e.target.value }));
                    if (fieldErrors.description) setFieldErrors((p) => ({ ...p, description: [] }));
                  }}
                  placeholder={
                    form.type === "error"  ? "Describe qué ocurrió, qué esperabas y cómo reproducirlo…" :
                    form.type === "idea"   ? "Explica la idea, qué problema resuelve y cómo la usarías…" :
                                            "Describe qué mejorarías y por qué sería útil…"
                  }
                  maxLength={2000}
                  rows={5}
                  className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] transition-colors focus:border-[var(--color-accent)] focus:outline-none"
                />
                <div className="flex items-center justify-between">
                  {fieldErrors.description?.length ? (
                    <p className="text-xs text-[var(--color-error)]">{fieldErrors.description[0]}</p>
                  ) : <span />}
                  <p className="text-xs text-[var(--color-text-3)]">{form.description.length}/2000</p>
                </div>
              </div>

              {/* Urgency */}
              <div className="space-y-2">
                <label className="text-label text-[var(--color-text-2)]">Urgencia percibida</label>
                <div className="flex gap-2">
                  {URGENCIES.map(({ value, label, color, bg, border }) => {
                    const active = form.urgency === value;
                    return (
                      <button key={value} type="button"
                        onClick={() => setForm((prev) => ({ ...prev, urgency: value }))}
                        className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium transition-all duration-150"
                        style={active ? {
                          background: bg, borderColor: border, color,
                        } : {
                          background: "var(--color-surface-2)",
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-2)",
                        }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rating */}
              <div className="space-y-2">
                <label className="text-label text-[var(--color-text-2)]">
                  ¿Cómo valoras la app?{" "}
                  <span className="font-normal normal-case tracking-normal text-[var(--color-text-3)]">(opcional)</span>
                </label>
                <StarRating value={form.rating} onChange={(v) => setForm((prev) => ({ ...prev, rating: v }))} />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <button type="button" onClick={() => setStep("type")}
                className="text-sm text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-2)]">
                ← Volver
              </button>
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--color-accent)]/20 transition-all duration-150 hover:bg-[var(--color-accent-hover)] hover:shadow-[var(--color-accent)]/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Enviando…</>
                ) : (
                  <><Send size={15} /> Enviar feedback</>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
