"use client";

/**
 * FeedbackForm — formulario de feedback del usuario.
 *
 * Reescrito en mayo 2026 para ser SINGLE-PAGE (antes era un wizard de
 * 2 pasos). Razones:
 *   - Más ágil: el usuario ve todo lo que tiene que rellenar de un vistazo.
 *   - Menos fricción para envíos rápidos.
 *   - Permite usar plantillas guiadas por tipo (ver TEMPLATES más abajo)
 *     que se autorrellenan al elegir tipo si la descripción está vacía.
 *   - Permite dictado por voz integrado (VoiceInputButton).
 *
 * El componente se usa en dos sitios:
 *   1) Página /feedback (panel principal, layout 2 columnas con MyFeedbackList).
 *   2) FeedbackModal contextual (botón "Reportar" desde cualquier elemento de
 *      la app: ticket, bus, etc.), pasando `prefillTarget`.
 *
 * El `onSuccess` se invoca tras un envío correcto para que el padre refresque
 * datos dependientes (la lista "Mis envíos", por ejemplo).
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Globe,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FeedbackAttachmentsPicker } from "@/components/feedback/FeedbackAttachmentsPicker";
import { VoiceInputButton } from "@/components/ui/VoiceInputButton";
import type { FeedbackCategory, FeedbackType, FeedbackUrgency } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { useTimedFlow } from "@/lib/ux-telemetry";

// ─── Options ───────────────────────────────────────────────────────────────────

const TYPES = [
  {
    value: "idea" as FeedbackType,
    label: "Idea",
    description: "Una funcionalidad nueva que te gustaría ver",
    icon: Lightbulb,
    color: "text-[#f59e0b]",
    iconBg: "bg-[rgba(245,158,11,0.14)]",
    idleBorder: "rgba(245,158,11,0.2)",
    activeBg: "rgba(245,158,11,0.14)",
    activeBorder: "rgba(245,158,11,0.7)",
    activeShadow: "rgba(245,158,11,0.15)",
  },
  {
    value: "error" as FeedbackType,
    label: "Error",
    description: "Algo no funciona como debería",
    icon: AlertCircle,
    color: "text-[var(--color-error)]",
    iconBg: "bg-[var(--color-error-light)]",
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
    idleBorder: "rgba(5,150,105,0.2)",
    activeBg: "rgba(5,150,105,0.12)",
    activeBorder: "rgba(5,150,105,0.7)",
    activeShadow: "rgba(5,150,105,0.12)",
  },
] as const;

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "interfaz", label: "Interfaz y diseño" },
  { value: "funcionalidad", label: "Funcionalidad" },
  { value: "rendimiento", label: "Rendimiento" },
  { value: "documentacion", label: "Documentación" },
  { value: "otro", label: "Otro" },
];

const URGENCIES = [
  { value: "baja" as FeedbackUrgency, label: "Baja", color: "#059669", bg: "rgba(5,150,105,0.14)", border: "rgba(5,150,105,0.5)" },
  { value: "media" as FeedbackUrgency, label: "Media", color: "#d97706", bg: "rgba(217,119,6,0.14)", border: "rgba(217,119,6,0.5)" },
  { value: "alta" as FeedbackUrgency, label: "Alta", color: "#dc2626", bg: "rgba(220,38,38,0.14)", border: "rgba(220,38,38,0.5)" },
] as const;

const STAR_LABELS: Record<number, string> = {
  1: "Muy insatisfecho",
  2: "Insatisfecho",
  3: "Neutral",
  4: "Satisfecho",
  5: "Muy satisfecho",
};

/**
 * Plantillas guía por tipo de feedback. Se autorrellenan en la descripción
 * la primera vez que el usuario elige un tipo Y el textarea está vacío. Si
 * el usuario ya empezó a escribir, NO se sobrescribe (lo respetamos). Si
 * elige otro tipo después, le ofrecemos insertar la nueva plantilla con
 * un botón "Usar plantilla" (no auto, para no perder lo escrito).
 *
 * Las plantillas son cortas y accionables: ayudan al usuario sin saturar.
 * El admin recibe descripciones más útiles, sobre todo en reportes de error
 * donde los pasos para reproducir son oro.
 */
const TEMPLATES: Record<FeedbackType, string> = {
  error: `¿Qué hiciste?
- 

¿Qué esperabas que pasara?
- 

¿Qué pasó realmente?
- 

Pasos para reproducirlo:
1. 
2. 
3. `,
  idea: `¿Qué problema resuelve esta idea?
- 

¿Cómo la usarías en tu día a día?
- 

¿A quién más beneficiaría?
- `,
  mejora: `¿Qué falla o falta hoy?
- 

¿Qué propones cambiar?
- 

¿Por qué sería útil para el equipo?
- `,
};

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = "form" | "done";
type FormState = {
  type: FeedbackType | null;
  category: FeedbackCategory;
  title: string;
  description: string;
  rating: number | null;
  urgency: FeedbackUrgency;
};

const defaultForm = (): FormState => ({
  type: null,
  category: "funcionalidad",
  title: "",
  description: "",
  rating: null,
  urgency: "media",
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
            className="group flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] transition-all duration-150 hover:scale-110 hover:border-[rgba(245,158,11,0.5)] hover:bg-[rgba(245,158,11,0.1)]"
            style={
              active !== null && star <= active
                ? {
                    background: "rgba(245,158,11,0.15)",
                    borderColor: "rgba(245,158,11,0.5)",
                    transform: "scale(1.06)",
                  }
                : {}
            }
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5 transition-all duration-150"
              fill={active !== null && star <= active ? "#f59e0b" : "none"}
              stroke={active !== null && star <= active ? "#f59e0b" : "var(--color-text-3)"}
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
              />
            </svg>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {active !== null && (
          <motion.p
            key={active}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
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

export function FeedbackForm({
  prefillTarget,
  onSuccess,
}: {
  prefillTarget?: FeedbackPrefillTarget;
  onSuccess?: () => void;
}) {
  const pathname = usePathname();
  const rm = useReducedMotion();
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [includeContext, setIncludeContext] = useState(true);
  const [attachments, setAttachments] = useState<File[]>([]);
  // Mensaje informativo durante la subida de adjuntos (post-creación).
  const [uploadingMsg, setUploadingMsg] = useState<string | null>(null);
  // Marcamos cuándo el usuario ha tocado el textarea de descripción para no
  // sobrescribir su texto al elegir tipo. La plantilla solo se inyecta
  // automáticamente la PRIMERA vez (descripción vacía y no tocada).
  const descTouchedRef = useRef(false);
  const descTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Telemetría: medimos el tiempo total de envío de feedback. Si el usuario
  // abandona sin completar, el hook emite `feedback_submit_abandon` al
  // desmontarse este componente.
  const feedbackFlow = useTimedFlow("feedback_submit");
  useEffect(() => {
    feedbackFlow.start({
      prefilled: Boolean(prefillTarget),
      prefill_id: prefillTarget?.id ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedType = TYPES.find((t) => t.value === form.type);

  /**
   * Inserta la plantilla del tipo en el textarea. Se llama desde dos sitios:
   *  - Automáticamente al elegir tipo si la descripción está vacía y el
   *    usuario no la ha tocado todavía.
   *  - Manualmente con el botón "Usar plantilla" del header del textarea.
   */
  const applyTemplate = (type: FeedbackType) => {
    const template = TEMPLATES[type];
    setForm((prev) => ({ ...prev, description: template }));
    descTouchedRef.current = false;
    // Posicionar cursor al final del primer bloque "- " para que el usuario
    // empiece a escribir donde toca, sin tener que navegar.
    requestAnimationFrame(() => {
      const ta = descTextareaRef.current;
      if (!ta) return;
      const idx = template.indexOf("- ") + 2;
      ta.focus();
      ta.setSelectionRange(idx, idx);
    });
  };

  const handleSelectType = (type: FeedbackType) => {
    setForm((prev) => ({ ...prev, type }));
    // Auto-aplicar plantilla solo si el textarea está limpio y no tocado.
    if (!descTouchedRef.current && form.description.trim() === "") {
      applyTemplate(type);
    }
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
      const currentPage = !includeContext
        ? undefined
        : prefillTarget
          ? `${prefillTarget.label} [${prefillTarget.id}]`
          : (pathname ?? undefined);
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          category: form.category,
          title: form.title.trim(),
          description: form.description.trim(),
          rating: form.rating,
          urgency: form.urgency,
          currentPage,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? "Error al enviar");
      }
      const created = (await res.json()) as { id: string };

      // Si hay adjuntos los subimos en una segunda llamada multipart. Si
      // falla NO marcamos error fatal: el feedback ya está creado, solo
      // notificamos por consola para no perder el reporte.
      if (attachments.length > 0 && created.id) {
        try {
          setUploadingMsg(
            `Subiendo ${attachments.length} ${attachments.length === 1 ? "captura" : "capturas"}…`,
          );
          const fd = new FormData();
          for (const f of attachments) fd.append("files", f, f.name);
          const upRes = await fetch(`/api/feedback/${encodeURIComponent(created.id)}/attachments`, {
            method: "POST",
            body: fd,
          });
          if (!upRes.ok) {
            console.warn(
              "El feedback se creó pero algún adjunto no se pudo subir.",
              await upRes.text().catch(() => ""),
            );
          }
        } catch (upErr) {
          console.warn("Error subiendo adjuntos de feedback:", upErr);
        } finally {
          setUploadingMsg(null);
        }
      }

      setStep("done");
      feedbackFlow.complete({
        type: form.type,
        category: form.category,
        urgency: form.urgency,
        rating: form.rating,
        attachments_count: attachments.length,
        has_context: includeContext,
      });
      onSuccess?.();
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
    setAttachments([]);
    setUploadingMsg(null);
    setStep("form");
    descTouchedRef.current = false;
  };

  // Si cambia la descripción desde código (plantilla auto), no marcar como
  // tocada. Solo al cambiar por interacción del usuario.
  useEffect(() => {
    // noop — el ref se actualiza en el handler del onChange.
  }, []);

  // ── Success ──
  if (step === "done") {
    return (
      <motion.div
        key="done"
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
            Tu aportación ha quedado registrada y aparece ya en tu lista a la derecha.
            El equipo la revisará próximamente.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
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
      {/* Banner de prefill (cuando se invoca desde un modal contextual) */}
      {prefillTarget && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-accent)]/20 bg-[var(--color-accent-light)] px-3 py-2">
          <MessageSquarePlus size={14} className="shrink-0 text-[var(--color-accent)]" />
          <p className="text-xs text-[var(--color-accent)]">
            Feedback sobre: <span className="font-semibold">{prefillTarget.label}</span>
          </p>
        </div>
      )}

      {/* Selector de tipo — versión compacta horizontal (single-page) */}
      <div className="space-y-2">
        <label className="text-label text-[var(--color-text-2)]">
          Tipo <span className="text-[var(--color-error)]">*</span>
        </label>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPES.map(({ value, label, description, icon: Icon, color, iconBg, idleBorder, activeBg, activeBorder, activeShadow }) => {
            const isActive = form.type === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => handleSelectType(value)}
                className="group flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all duration-150"
                style={
                  isActive
                    ? {
                        background: activeBg,
                        borderColor: activeBorder,
                        boxShadow: `0 0 0 3px ${activeShadow}`,
                      }
                    : {
                        background: "var(--color-surface-2)",
                        borderColor: idleBorder,
                      }
                }
              >
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconBg, "transition-transform duration-200 group-hover:scale-110")}>
                  <Icon size={18} className={color} />
                </div>
                <div className="min-w-0">
                  <p className={cn("text-sm font-semibold", color)}>{label}</p>
                  <p className="line-clamp-2 text-[10.5px] leading-snug text-[var(--color-text-3)]">{description}</p>
                </div>
              </button>
            );
          })}
        </div>
        {fieldErrors.type?.length ? (
          <p className="text-xs text-[var(--color-error)]">{fieldErrors.type[0]}</p>
        ) : null}
      </div>

      {/* Categoría */}
      <div className="space-y-2">
        <label className="text-label text-[var(--color-text-2)]">Categoría</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, category: value }))}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                form.category === value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Título */}
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
          ) : (
            <span />
          )}
          <p className="text-xs text-[var(--color-text-3)]">{form.title.length}/150</p>
        </div>
      </div>

      {/* Descripción con voz + plantilla */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="fb-description" className="text-label text-[var(--color-text-2)]">
            Descripción <span className="text-[var(--color-error)]">*</span>
          </label>
          <div className="flex items-center gap-1.5">
            {selectedType ? (
              <button
                type="button"
                onClick={() => applyTemplate(selectedType.value)}
                title={`Insertar plantilla de ${selectedType.label.toLowerCase()}`}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[10.5px] font-medium text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
              >
                <ClipboardList size={11} className={selectedType.color} />
                Usar plantilla
              </button>
            ) : null}
            <VoiceInputButton
              onTranscript={(t) => {
                setForm((prev) => ({
                  ...prev,
                  description: prev.description ? `${prev.description} ${t}`.trim() : t,
                }));
                descTouchedRef.current = true;
                if (fieldErrors.description) setFieldErrors((p) => ({ ...p, description: [] }));
              }}
              size="sm"
            />
          </div>
        </div>
        <textarea
          id="fb-description"
          ref={descTextareaRef}
          value={form.description}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, description: e.target.value }));
            descTouchedRef.current = true;
            if (fieldErrors.description) setFieldErrors((p) => ({ ...p, description: [] }));
          }}
          placeholder={
            selectedType
              ? `Cuéntanos los detalles (puedes pulsar "Usar plantilla" para tener una guía con preguntas)…`
              : "Elige primero un tipo arriba y te ofreceremos una guía con preguntas."
          }
          maxLength={2000}
          rows={9}
          className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm leading-relaxed text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] transition-colors focus:border-[var(--color-accent)] focus:outline-none"
        />
        <div className="flex items-center justify-between">
          {fieldErrors.description?.length ? (
            <p className="text-xs text-[var(--color-error)]">{fieldErrors.description[0]}</p>
          ) : (
            <span />
          )}
          <p className="text-xs text-[var(--color-text-3)]">{form.description.length}/2000</p>
        </div>
      </div>

      {/* Urgencia */}
      <div className="space-y-2">
        <label className="text-label text-[var(--color-text-2)]">Urgencia percibida</label>
        <div className="flex gap-2">
          {URGENCIES.map(({ value, label, color, bg, border }) => {
            const active = form.urgency === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, urgency: value }))}
                className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium transition-all duration-150"
                style={
                  active
                    ? { background: bg, borderColor: border, color }
                    : {
                        background: "var(--color-surface-2)",
                        borderColor: "var(--color-border)",
                        color: "var(--color-text-2)",
                      }
                }
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Adjuntos (capturas) */}
      <FeedbackAttachmentsPicker
        files={attachments}
        onChange={setAttachments}
        disabled={submitting}
      />

      {/* Rating */}
      <div className="space-y-2">
        <label className="text-label text-[var(--color-text-2)]">
          ¿Cómo valoras la app?{" "}
          <span className="font-normal normal-case tracking-normal text-[var(--color-text-3)]">(opcional)</span>
        </label>
        <StarRating value={form.rating} onChange={(v) => setForm((prev) => ({ ...prev, rating: v }))} />
      </div>

      {/* Chip de contexto técnico (opt-out) */}
      {!prefillTarget && pathname ? (
        <label className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-2.5 text-[12px]">
          <input
            type="checkbox"
            checked={includeContext}
            onChange={(e) => setIncludeContext(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
            aria-label="Incluir contexto de la página"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-medium text-[var(--color-text-2)]">
              <Globe size={12} className="text-[var(--color-text-3)]" />
              Incluir contexto técnico
            </span>
            <span className="mt-0.5 block text-[11px] text-[var(--color-text-3)]">
              Se enviará la ruta <span className="font-mono">{pathname}</span> para que el equipo
              sepa desde dónde reportaste. Desmárcalo si no quieres compartirla.
            </span>
          </span>
        </label>
      ) : null}

      {/* Mensaje de subida de adjuntos */}
      {uploadingMsg ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-2 text-xs text-[var(--color-text-2)]">
          <Loader2 size={13} className="animate-spin text-[var(--color-accent)]" />
          {uploadingMsg}
        </div>
      ) : null}

      {/* Error global */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Acciones */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--color-accent)]/20 transition-all duration-150 hover:bg-[var(--color-accent-hover)] hover:shadow-[var(--color-accent)]/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Enviando…
            </>
          ) : (
            <>
              <Send size={15} /> Enviar feedback
            </>
          )}
        </button>
      </div>
    </div>
  );
}
