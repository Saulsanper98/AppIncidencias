"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, Check, ChevronDown, ExternalLink, Film, ImageIcon, Info, Plus, UploadCloud } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { TicketTemplatePicker } from "@/components/tickets/TicketTemplatePicker";
import { VoiceInputButton } from "@/components/ui/VoiceInputButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import type {
  CatalogBus,
  CreateTicketPayload,
  FormState,
  TicketFormDraftPayload,
  TicketFormSectionId,
} from "@/components/tickets/tickets-module-types";
import {
  TICKET_ATTACH_ACCEPT,
  TICKET_ATTACH_MAX_FILES,
  TICKET_ATTACH_MAX_IMAGE_BYTES,
  TICKET_ATTACH_MAX_TOTAL_BYTES,
  TICKET_ATTACH_MAX_VIDEO_BYTES,
  TICKET_FORM_DRAFT_KEY,
  TICKET_FORM_SECTION_ORDER,
  attachByteLimit,
  classifyAttachFile,
  defaultForm,
  normalizeAccordionOpen,
} from "@/components/tickets/tickets-module-types";
import type { SessionUser } from "@/lib/domain";
import { calculatePriority, calculateSlaMinutes, toUiPriority } from "@/lib/ticketing";
import {
  GENERIC_SUBSUBTIPO,
  GENERIC_SUBTIPO,
  GENERIC_TIPO,
  getGenericTipologia,
  type TipologiaItem,
} from "@/lib/tipologia";
import { priorityBadgeProps } from "@/lib/ticket-ui";
import { cn } from "@/lib/utils";
import { useTimedFlow } from "@/lib/ux-telemetry";

const TicketLocationPicker = dynamic(
  () => import("@/components/tickets/ticket-location-picker").then((m) => m.TicketLocationPicker),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[200px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] text-caption text-[var(--color-text-3)]"
        aria-busy="true"
      >
        Cargando selector de mapa…
      </div>
    ),
  },
);

/**
 * Stepper visual de 4 pasos: círculos numerados con estado completado /
 * activo / pendiente, conectados por una línea de progreso continuo.
 * Mucho más legible que la barra de 4 segmentos del diseño anterior.
 */
function FormStepper({
  steps,
  nextIndex,
  openIndex,
  flashIndex,
  onJump,
  percent,
}: {
  steps: boolean[];
  nextIndex: number | null;
  openIndex: number;
  flashIndex: number | null;
  onJump: (i: number) => void;
  percent: number;
}) {
  const labels = ["Equipo", "Tipología", "Detalle", "Adjuntos"] as const;
  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 pb-3 pt-3"
      aria-label="Progreso del borrador"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-eyebrow">Progreso</span>
        <span className="num-tabular text-[12px] font-semibold text-[var(--color-text-1)]">{percent}%</span>
      </div>
      <div className="relative flex items-center justify-between">
        {/* Línea base */}
        <div className="absolute left-3 right-3 top-3.5 h-px bg-[var(--color-border)]" aria-hidden />
        {/* Línea de progreso (proporcional al porcentaje completado, capada al
            tramo entre el primer y último paso). */}
        <div
          className="absolute left-3 top-3.5 h-px bg-[var(--color-accent)] transition-[width] duration-300 ease-out"
          style={{ width: `calc(${percent}% - 24px * ${percent / 100})` }}
          aria-hidden
        />
        {steps.map((done, i) => {
          const isOpen = i === openIndex;
          const isNext = i === nextIndex;
          const flash = i === flashIndex;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              aria-current={isOpen ? "step" : undefined}
              className="relative z-10 flex flex-col items-center gap-1.5 px-1"
              title={labels[i]}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold transition-all duration-200",
                  done
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                    : isNext || isOpen
                      ? "border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-3)]",
                  flash && "ccmgc-draft-step-flash",
                )}
              >
                {done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors",
                  done
                    ? "text-[var(--color-text-2)]"
                    : isOpen || isNext
                      ? "text-[var(--color-text-1)]"
                      : "text-[var(--color-text-3)]",
                )}
              >
                {labels[i]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CollapsibleFormBlock({
  title,
  subtitle,
  stepLabel,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  stepLabel?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 transition-shadow duration-200",
        open && "ring-2 ring-[var(--color-accent)]/30 shadow-[0_0_0_1px_rgba(37,99,235,0.12)]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-[var(--color-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-label text-[var(--color-text-1)]">
            {stepLabel ? (
              <span className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-text-3)]">
                {stepLabel}
              </span>
            ) : null}
            {title}
          </p>
          {subtitle ? <p className="truncate text-caption text-[var(--color-text-3)]">{subtitle}</p> : null}
        </div>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-[var(--color-text-3)] transition-transform duration-200 ease-out", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="block"
            initial={{ height: 0, opacity: 0.6 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0.6 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden border-t border-[var(--color-border)]"
          >
            <div className="px-3 py-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export type TicketCreateFormProps = {
  catalog: CatalogBus[];
  /**
   * Catalogo de lineas validas (alimenta el autocompletar del campo "Servicio /
   * linea"). El input acepta texto libre, esto solo sugiere valores conocidos.
   */
  lineas: string[];
  tipologias: TipologiaItem[];
  sessionUser: SessionUser | null;
  saving: boolean;
  onCreateTicket: (payload: CreateTicketPayload) => Promise<void>;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
  setNoticeTone: (value: "success" | "warning" | "info") => void;
  setNoticePlacement: (value: "card" | "toast" | "center") => void;
};

export function TicketCreateForm({
  catalog,
  lineas,
  tipologias,
  sessionUser,
  saving,
  onCreateTicket,
  setError,
  setNotice,
  setNoticeTone,
  setNoticePlacement,
}: TicketCreateFormProps) {
  const [form, setForm] = useState<FormState>(defaultForm());
  const [formSectionOpen, setFormSectionOpen] = useState<Record<TicketFormSectionId, boolean>>(() =>
    normalizeAccordionOpen(undefined, "equipment"),
  );

  // Telemetría: medimos el tiempo total de creación de ticket, paso a paso.
  // El flujo se "abre" al montar el formulario y se "completa" cuando el
  // backend confirma la creación. Si el usuario se va sin completar, el hook
  // emite automáticamente un `ticket_create_abandon` en el unmount.
  const createFlow = useTimedFlow("ticket_create");
  useEffect(() => {
    createFlow.start();
    // start() solo debe correr al montar; createFlow es estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Cada vez que cambia la sección abierta, emitimos un `ticket_create_step`
  // con el nombre de la nueva sección y la duración desde el anterior.
  const lastSectionRef = useRef<TicketFormSectionId | null>(null);
  useEffect(() => {
    const current = TICKET_FORM_SECTION_ORDER.find((k) => formSectionOpen[k]) ?? null;
    if (current && current !== lastSectionRef.current) {
      lastSectionRef.current = current;
      createFlow.step(current);
    }
    // createFlow es estable; lo excluimos para no disparar dobles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formSectionOpen]);
  const [formDraftHydrated, setFormDraftHydrated] = useState(false);
  const [stagedUploadFiles, setStagedUploadFiles] = useState<File[]>([]);
  // ─── Sugerencias Ibrahim (fase 1 mejoras técnicos campo) ──────────────
  // 1b) Auto-asignar al técnico/gestor que crea el ticket. Si es conductor,
  //     no aplica (no pueden ser asignados).
  // 1c) Toggle para crear ya como resuelto (caso resuelto in situ).
  const canActorAssumeTicket =
    sessionUser?.role === "tecnico_campo" || sessionUser?.role === "gestor_centro_control";
  const [assignToMe, setAssignToMe] = useState<boolean>(canActorAssumeTicket);
  const [createAsResolved, setCreateAsResolved] = useState<boolean>(false);
  const [resolutionNote, setResolutionNote] = useState<string>("");
  // Si la sesión llega después del primer render (lo habitual), sincronizamos
  // el default de "asignarme" al rol real una vez.
  const initAssignSyncedRef = useRef(false);
  useEffect(() => {
    if (initAssignSyncedRef.current) return;
    if (sessionUser?.role) {
      initAssignSyncedRef.current = true;
      setAssignToMe(canActorAssumeTicket);
    }
  }, [sessionUser?.role, canActorAssumeTicket]);
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const [mapLocationHint, setMapLocationHint] = useState<string | null>(null);
  // Sugerencias KB para evitar duplicar tickets que ya tienen artículo
  // resuelto en la base de conocimiento. Se rellenan según se escriben
  // título / descripción (debounced a 350 ms).
  const [kbSuggestions, setKbSuggestions] = useState<
    { id: string; slug: string; title: string; summary: string | null; category: string | null }[]
  >([]);
  const [kbSuggestDismissed, setKbSuggestDismissed] = useState(false);
  // SLA configurable en BD: lo leemos al montar para que el preview use los
  // tiempos reales en lugar de los defaults 30/120/240. Si el fetch falla,
  // `calculateSlaMinutes` cae al default histórico (lo que tampoco rompe nada).
  const [slaOverride, setSlaOverride] = useState<Record<"alta" | "media" | "baja", number> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/sla-config", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { sla?: Record<"alta" | "media" | "baja", number> };
        if (!cancelled && data.sla) setSlaOverride(data.sla);
      } catch {
        /* ignorar: caemos al default histórico */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sugerencias KB en tiempo real: cada vez que el usuario edita título o
  // descripción esperamos 350 ms y pedimos hasta 5 sugerencias. Si el
  // usuario las descarta, no volvemos a mostrar hasta que cambie el texto.
  useEffect(() => {
    const probe = `${form.title} ${form.description}`.trim();
    if (probe.length < 6) {
      setKbSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/kb/suggest?q=${encodeURIComponent(probe)}`, {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          suggestions: { id: string; slug: string; title: string; summary: string | null; category: string | null }[];
        };
        setKbSuggestions(data.suggestions ?? []);
      } catch (error) {
        if ((error as { name?: string })?.name !== "AbortError") {
          console.warn("kb-suggest:", error);
        }
      }
    }, 350);
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [form.title, form.description]);

  // Si el usuario cambia el texto tras haber descartado, reaparece la caja.
  useEffect(() => {
    setKbSuggestDismissed(false);
  }, [form.title, form.description]);

  const trimmedBusId = form.busId.trim();
  const selectedBus = useMemo(() => catalog.find((bus) => bus.id === trimmedBusId), [catalog, trimmedBusId]);
  /**
   * Pedro pidió poder teclear un bus que no esté en el catálogo. Si el usuario
   * escribe algo que no coincide con ningún bus existente, lo marcamos como
   * "nuevo": al guardar, el backend lo creará al vuelo con un activo
   * SAE-DEFAULT y se ocultará el selector de activo.
   */
  const isNewBus = trimmedBusId !== "" && !selectedBus;
  // El activo se asigna automaticamente en backend (SAE-DEFAULT del bus). Solo
  // conservamos `selectedAsset` para el SLA del catalogo si existiera explicito.
  const selectedAsset = (selectedBus?.assets ?? []).find((asset) => asset.id === form.assetId);
  const availableTipos = useMemo(() => {
    // "Generica" se relega al final aunque alfabeticamente caiga antes,
    // para que el usuario la vea como ultima opcion (catch-all).
    const tipos = Array.from(new Set(tipologias.map((item) => item.tipo)));
    const generic = tipos.find((t) => t === GENERIC_TIPO);
    const rest = tipos.filter((t) => t !== GENERIC_TIPO).sort((a, b) => a.localeCompare(b));
    return generic ? [...rest, generic] : rest;
  }, [tipologias]);
  const isGenericTipo = form.tipo === GENERIC_TIPO;
  const availableSubtipos = useMemo(
    () =>
      Array.from(new Set(tipologias.filter((item) => item.tipo === form.tipo).map((item) => item.subtipo))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [tipologias, form.tipo],
  );
  const availableSubsubtipos = useMemo(
    () =>
      tipologias
        .filter((item) => item.tipo === form.tipo && item.subtipo === form.subtipo)
        .map((item) => item.subsubtipo),
    [tipologias, form.tipo, form.subtipo],
  );
  const selectedTipologia = useMemo(
    () =>
      tipologias.find(
        (item) => item.tipo === form.tipo && item.subtipo === form.subtipo && item.subsubtipo === form.subsubtipo,
      ),
    [tipologias, form.tipo, form.subtipo, form.subsubtipo],
  );

  const computedPriority = useMemo(() => {
    if (selectedAsset) {
      return calculatePriority({
        assetType: selectedAsset.type,
        impactedLines: form.impactedLines,
        serviceStopped: form.serviceStopped,
        nivelImpacto: form.nivelImpacto,
      });
    }
    // Para un bus nuevo (sin activo aún) usamos el tipo por defecto SAE para
    // que el cálculo de prioridad y SLA tenga sentido en el preview.
    if (isNewBus) {
      return calculatePriority({
        assetType: "sae",
        impactedLines: form.impactedLines,
        serviceStopped: form.serviceStopped,
        nivelImpacto: form.nivelImpacto,
      });
    }
    return "baja";
  }, [selectedAsset, isNewBus, form.impactedLines, form.serviceStopped, form.nivelImpacto]);

  const computedSla =
    selectedAsset?.slaMinutes != null && selectedAsset.slaMinutes > 0
      ? selectedAsset.slaMinutes
      : calculateSlaMinutes(computedPriority, slaOverride);
  const ticketFormProgress = useMemo(() => {
    const checks = [
      // Paso 1: hay bus indicado (el activo se asigna automaticamente en backend).
      Boolean(trimmedBusId),
      Boolean(form.tipo && form.subtipo && form.subsubtipo),
      form.title.trim().length >= 3,
      form.description.trim().length >= 8,
    ];
    const filled = checks.filter(Boolean).length;
    const nextStepIndex = checks.findIndex((c) => !c);
    return {
      pct: Math.round((filled / checks.length) * 100),
      filled,
      total: checks.length,
      checks,
      nextStepIndex: nextStepIndex === -1 ? null : nextStepIndex,
    };
  }, [form, trimmedBusId, isNewBus]);

  const reduceMotionUi = useReducedMotion();
  const prevFormProgressFilledRef = useRef(ticketFormProgress.filled);
  const [draftStepFlashIndex, setDraftStepFlashIndex] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevFormProgressFilledRef.current;
    if (ticketFormProgress.filled > prev) {
      setDraftStepFlashIndex(ticketFormProgress.filled - 1);
      const flashTimer = window.setTimeout(() => setDraftStepFlashIndex(null), 700);
      // Antes auto-avanzábamos al siguiente paso cerrando la sección activa,
      // pero eso "robaba" el foco mientras el usuario aún estaba escribiendo
      // (por ejemplo, al teclear el 3er carácter del título). Ahora SOLO
      // mostramos el flash visual del ✓ y dejamos que el usuario navegue a
      // mano (o pulse al botón principal cuando esté listo). El stepper
      // superior sigue indicando qué paso falta.
      prevFormProgressFilledRef.current = ticketFormProgress.filled;
      return () => {
        window.clearTimeout(flashTimer);
      };
    }
    prevFormProgressFilledRef.current = ticketFormProgress.filled;
  }, [ticketFormProgress.filled]);

  const toggleFormSection = useCallback((id: TicketFormSectionId) => {
    setFormSectionOpen((prev) => {
      if (prev[id]) return { ...prev, [id]: false };
      return {
        equipment: id === "equipment",
        tipologia: id === "tipologia",
        detail: id === "detail",
        attachments: id === "attachments",
      };
    });
  }, []);

  const formSectionLiveMessage = useMemo(() => {
    const id = TICKET_FORM_SECTION_ORDER.find((k) => formSectionOpen[k]);
    if (!id) return "";
    const map: Record<TicketFormSectionId, string> = {
      equipment: "Sección activa: Equipo afectado.",
      tipologia: "Sección activa: Tipología de incidencia.",
      detail: "Sección activa: Detalle del ticket.",
      attachments: "Sección activa: Adjuntos y notas.",
    };
    return map[id];
  }, [formSectionOpen]);

  useEffect(() => {
    if (catalog.length === 0 || formDraftHydrated) return;
    try {
      const raw = sessionStorage.getItem(TICKET_FORM_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TicketFormDraftPayload;
        if (parsed?.form) {
          const d = parsed.form;
          // Conservamos el busId del borrador aunque no esté en el catálogo:
          // puede ser un "bus nuevo" tecleado por el usuario (sugerencia de
          // Pedro). Si en cambio el borrador no tenía busId, usamos el primero
          // del catálogo como punto de partida.
          const draftBusId = (d.busId ?? "").trim();
          const busId = draftBusId !== "" ? draftBusId : catalog[0].id;
          const busInCatalog = catalog.some((b) => b.id === busId);
          const assets = catalog.find((b) => b.id === busId)?.assets ?? [];
          const assetOk = busInCatalog && assets.some((a) => a.id === d.assetId);
          const rawDraft = d as FormState & { photoNames?: unknown };
          const { photoNames, ...draftFields } = rawDraft;
          void photoNames;
          setForm({
            ...draftFields,
            busId,
            assetId: assetOk ? d.assetId : "",
            impactedLines:
              typeof d.impactedLines === "number" && Number.isFinite(d.impactedLines)
                ? Math.min(10, Math.max(1, d.impactedLines))
                : 1,
            serviceStopped: Boolean(d.serviceStopped),
            // Drafts previos no tenian `lineaLabel`. Garantizamos string vacio
            // (no undefined) para que el input controlado no chille.
            lineaLabel: typeof d.lineaLabel === "string" ? d.lineaLabel : "",
            servicioLabel: typeof d.servicioLabel === "string" ? d.servicioLabel : "",
            conductorLabel: typeof d.conductorLabel === "string" ? d.conductorLabel : "",
          });
          setStagedUploadFiles([]);
          // OJO: NO restauramos `parsed.openSections`. Aunque el draft
          // guarda qué acordeón estaba abierto, al volver a entrar a
          // "Tickets" queremos arrancar SIEMPRE en el paso 1 (equipo
          // afectado). El stepper superior y los useState iniciales ya
          // dejan abierto "equipment" por defecto, así que basta con
          // dejar de aplicar el `openSections` persistido.
        }
      }
    } catch {
      /* borrador corrupto */
    }
    setForm((prev) => {
      if (catalog.length === 0) return prev;
      // Si el form ya tiene un busId (sea del catálogo o "nuevo"), lo dejamos
      // intacto; sólo cuando está vacío inicializamos con el primer bus.
      if (prev.busId.trim()) return prev;
      return defaultForm(catalog[0].id);
    });
    setFormDraftHydrated(true);
  }, [catalog, formDraftHydrated]);

  useEffect(() => {
    if (!formDraftHydrated || catalog.length === 0) return;
    try {
      const payload: TicketFormDraftPayload = { form, openSections: formSectionOpen };
      sessionStorage.setItem(TICKET_FORM_DRAFT_KEY, JSON.stringify(payload));
    } catch {
      /* cuota o modo privado */
    }
  }, [form, formSectionOpen, formDraftHydrated, catalog.length]);

  const mergeStagedUploadFiles = useCallback((prev: File[], added: File[]) => {
    const seen = new Set(prev.map((f) => `${f.name.toLowerCase()}:${f.size}`));
    const next = [...prev];
    for (const file of added) {
      const key = `${file.name.toLowerCase()}:${file.size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(file);
      if (next.length >= TICKET_ATTACH_MAX_FILES) break;
    }
    return next.slice(0, TICKET_ATTACH_MAX_FILES);
  }, []);

  const handlePhotoInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (!list?.length) return;
    const accepted: File[] = [];
    const errors: string[] = [];
    let combinedBytes = stagedUploadFiles.reduce((sum, f) => sum + f.size, 0);

    for (const file of Array.from(list)) {
      const kind = classifyAttachFile(file);
      if (!kind) {
        errors.push(`${file.name}: tipo no permitido (solo imágenes o vídeos).`);
        continue;
      }
      const limit = attachByteLimit(kind);
      if (file.size > limit) {
        const limitMb = Math.round(limit / (1024 * 1024));
        errors.push(
          `${file.name}: ${kind === "video" ? "vídeo" : "imagen"} supera ${limitMb} MB.`,
        );
        continue;
      }
      if (combinedBytes + file.size > TICKET_ATTACH_MAX_TOTAL_BYTES) {
        const totalMb = Math.round(TICKET_ATTACH_MAX_TOTAL_BYTES / (1024 * 1024));
        errors.push(`Tamaño total supera ${totalMb} MB; se omite ${file.name}.`);
        continue;
      }
      if (!file.name.trim()) continue;
      accepted.push(file);
      combinedBytes += file.size;
    }
    setStagedUploadFiles((prev) => mergeStagedUploadFiles(prev, accepted));
    if (errors.length) {
      setNotice(errors.slice(0, 2).join(" "));
      setNoticeTone("warning");
      setNoticePlacement("center");
    }
    event.target.value = "";
  };

  const removePhotoAt = (index: number) => {
    setStagedUploadFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submitCreate = async () => {
    if (!sessionUser) {
      setError("Debes iniciar sesión para crear tickets.");
      return;
    }
    if (!selectedTipologia || !trimmedBusId) {
      return;
    }
    // Si el bus es nuevo o el usuario no eligió activo concreto, dejamos que el
    // backend resuelva (creará bus + SAE-DEFAULT al vuelo).
    await onCreateTicket({
      form,
      stagedUploadFiles,
      selectedBus: selectedBus ?? null,
      selectedAsset: selectedAsset ?? null,
      selectedTipologia,
      assignToMe: canActorAssumeTicket ? assignToMe : false,
      createAsResolved: canActorAssumeTicket ? createAsResolved : false,
      resolutionNote: createAsResolved ? resolutionNote.trim() : "",
      onTicketCreated: () => {
        // Telemetría: ticket creado con éxito. Anotamos datos útiles para
        // poder agregar después (qué tipo se crean más rápido, qué priority,
        // si llevaba adjuntos, si se auto-asignó, etc.).
        createFlow.complete({
          tipo: selectedTipologia?.tipo ?? null,
          subtipo: selectedTipologia?.subtipo ?? null,
          subsubtipo: selectedTipologia?.subsubtipo ?? null,
          nivelImpacto: selectedTipologia?.nivelImpacto ?? null,
          attachments_count: stagedUploadFiles.length,
          assign_to_me: canActorAssumeTicket ? assignToMe : false,
          created_as_resolved: canActorAssumeTicket ? createAsResolved : false,
        });
        // Reabrimos un flujo nuevo para el siguiente ticket que cree el usuario.
        createFlow.start();
        lastSectionRef.current = null;
        setForm((prev) => ({ ...defaultForm(prev.busId), busId: prev.busId }));
        setStagedUploadFiles([]);
        setFormSectionOpen(normalizeAccordionOpen(undefined, "equipment"));
        setCreateAsResolved(false);
        setResolutionNote("");
      },
    });
  };

  return (
    <motion.article
      id="tickets-new-form-anchor"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex min-h-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-shadow duration-200 hover:shadow-md xl:col-span-5 xl:min-h-[min(520px,68vh)]"
      aria-labelledby="tickets-new-form-title"
      aria-describedby="tickets-new-form-summary"
    >
      <span id="tickets-new-form-summary" className="sr-only">
        Formulario en secciones plegables: equipo afectado, tipología, detalle y adjuntos. El borrador se guarda en esta
        sesión del navegador. Barra de progreso según campos obligatorios completados. Al final, prioridad calculada y
        botón crear ticket.
      </span>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {formSectionLiveMessage}
      </p>
      {/* ── Cabecera con 3 zonas verticales bien separadas (premium iter. 4) ── */}
      <header className="mb-4 space-y-3">
        {/* 1. Título + icono + identidad del ticket en una línea. */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-light)]">
              <Plus size={16} strokeWidth={1.5} className="text-[var(--color-accent)]" />
            </div>
            <div className="min-w-0">
              <h3 id="tickets-new-form-title" className="text-[15px] font-semibold leading-tight text-[var(--color-text-1)]">
                Nuevo ticket
              </h3>
              <p className="mt-0.5 text-[12px] leading-tight text-[var(--color-text-3)]">
                Ancla la incidencia a un bus y activo concreto
              </p>
            </div>
          </div>
          <FeedbackTargetButton id="tickets/formulario-nuevo" label="Formulario de nuevo ticket" />
        </div>

        {/* 2. Chip identidad: Bus + estado del activo. Limpio, una sola línea. */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2 text-[12px] leading-snug text-[var(--color-text-2)]">
          <span className="text-eyebrow shrink-0">Identidad</span>
          <span className="num-tabular font-mono text-[13px] font-semibold text-[var(--color-text-1)]">
            {trimmedBusId || "—"}
          </span>
          {isNewBus ? (
            <span
              className="inline-flex items-center rounded-full border border-[rgba(245,158,11,0.35)] bg-[var(--color-warning-light)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--color-warning)]"
              title="Este bus se creará en el catálogo al guardar"
            >
              nuevo
            </span>
          ) : null}
          <span className="text-[var(--color-text-3)]/60">·</span>
          <span className="min-w-0 truncate">
            {selectedAsset
              ? `${selectedAsset.id} (${selectedAsset.type})`
              : isNewBus
                ? "SAE por defecto (auto)"
                : selectedBus
                  ? "Selecciona activo"
                  : "Selecciona o teclea un bus"}
          </span>
        </div>

        {/* 3. Stepper visual: círculos numerados conectados por línea, con
              estado completado / activo / pendiente. Auto-clicable. */}
        <FormStepper
          steps={ticketFormProgress.checks}
          nextIndex={ticketFormProgress.nextStepIndex}
          openIndex={TICKET_FORM_SECTION_ORDER.findIndex((id) => formSectionOpen[id])}
          flashIndex={!reduceMotionUi ? draftStepFlashIndex : null}
          onJump={(idx) => {
            const id = TICKET_FORM_SECTION_ORDER[idx];
            setFormSectionOpen({
              equipment: id === "equipment",
              tipologia: id === "tipologia",
              detail: id === "detail",
              attachments: id === "attachments",
            });
          }}
          percent={ticketFormProgress.pct}
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-3">
          <TicketTemplatePicker form={form} setForm={setForm} sessionUser={sessionUser} />
          <CollapsibleFormBlock
            title="Equipo afectado"
            stepLabel="1/4"
            subtitle={
              selectedBus
                ? [
                    `${selectedBus.id}${selectedBus.operator ? ` · ${selectedBus.operator}` : ""}`,
                    form.lineaLabel.trim() ? `Línea ${form.lineaLabel.trim()}` : null,
                    form.servicioLabel.trim() ? `Servicio ${form.servicioLabel.trim()}` : null,
                    form.conductorLabel.trim() ? form.conductorLabel.trim() : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : isNewBus
                  ? `${trimmedBusId} · bus nuevo`
                  : "Bus, línea, servicio y conductor"
            }
            open={formSectionOpen.equipment}
            onToggle={() => toggleFormSection("equipment")}
          >
            {/*
             * Layout unificado: Bus + Linea + Servicio + Conductor en una sola
             * fila (grid 4 columnas en desktop, responsive en moviles).
             *  - Bus: combobox (catalogo + texto libre).
             *  - Linea: autocomplete contra catalogo `Linea`, acepta texto libre.
             *  - Servicio: texto libre puro (turno, codigo de servicio…).
             *  - Conductor: texto libre puro.
             * El activo SAE-DEFAULT se asigna automaticamente en backend.
             */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block space-y-1">
                <span className="text-label">Bus</span>
                <Input
                  list="ticket-bus-options"
                  value={form.busId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, busId: event.target.value, assetId: "" }))
                  }
                  placeholder="Teclea o selecciona…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <datalist id="ticket-bus-options">
                  {catalog.map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      {bus.operator}
                      {bus.municipio ? ` · ${bus.municipio}` : ""}
                    </option>
                  ))}
                </datalist>
              </label>
              <label className="block space-y-1">
                <span className="text-label">
                  Línea
                  <span className="ml-1 text-[10px] font-normal text-[var(--color-text-3)]">(opcional)</span>
                </span>
                <Input
                  list="ticket-linea-options"
                  value={form.lineaLabel}
                  onChange={(event) => setForm((prev) => ({ ...prev, lineaLabel: event.target.value }))}
                  placeholder="Ej: GL-1, GL-30…"
                  maxLength={120}
                  autoComplete="off"
                  spellCheck={false}
                />
                <datalist id="ticket-linea-options">
                  {Array.from(
                    new Set([...(selectedBus?.lineas ?? []), ...lineas]),
                  ).map((linea) => (
                    <option key={linea} value={linea} />
                  ))}
                </datalist>
              </label>
              <label className="block space-y-1">
                <span className="text-label">
                  Servicio
                  <span className="ml-1 text-[10px] font-normal text-[var(--color-text-3)]">(opcional)</span>
                </span>
                <Input
                  value={form.servicioLabel}
                  onChange={(event) => setForm((prev) => ({ ...prev, servicioLabel: event.target.value }))}
                  placeholder="Turno, código de servicio…"
                  maxLength={120}
                  autoComplete="off"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-label">
                  Conductor
                  <span className="ml-1 text-[10px] font-normal text-[var(--color-text-3)]">(opcional)</span>
                </span>
                <Input
                  value={form.conductorLabel}
                  onChange={(event) => setForm((prev) => ({ ...prev, conductorLabel: event.target.value }))}
                  placeholder="Ej: Juan Pérez"
                  maxLength={120}
                  autoComplete="off"
                />
              </label>
            </div>

            {isNewBus ? (
              <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] leading-snug text-amber-100">
                <span className="font-medium">Bus nuevo:</span> al guardar se creará{" "}
                <span className="font-mono">{trimmedBusId}</span> en el catálogo. El gestor podrá completar
                operador, municipio y líneas más tarde desde Administración → Catálogo.
              </p>
            ) : null}
            {form.busId && !isNewBus ? (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-snug text-[var(--color-text-2)]">
                <Link
                  href="/inventory"
                  className="shrink-0 font-medium text-[var(--color-accent)] underline-offset-2 transition-colors hover:underline"
                >
                  Ver inventario
                </Link>
                <span className="min-w-0 text-[var(--color-text-3)]">Stock de repuestos (referencia rápida).</span>
              </p>
            ) : null}
          </CollapsibleFormBlock>

          <CollapsibleFormBlock
            title="Tipología de incidencia"
            stepLabel="2/4"
            subtitle={
              isGenericTipo
                ? "Generica (sin clasificar)"
                : form.subsubtipo
                  ? `${form.tipo} · ${form.subtipo}`
                  : "Tipo, subtipo e incidencia"
            }
            open={formSectionOpen.tipologia}
            onToggle={() => toggleFormSection("tipologia")}
          >
            <div
              className={cn(
                "grid grid-cols-1 gap-3",
                isGenericTipo ? "md:grid-cols-1" : "md:grid-cols-3",
              )}
            >
              <label className="block space-y-1">
                <span className="text-label">Tipo</span>
                <Select
                  value={form.tipo}
                  onChange={(event) => {
                    const nextTipo = event.target.value;
                    if (nextTipo === GENERIC_TIPO) {
                      const generic = getGenericTipologia();
                      setForm((prev) => ({
                        ...prev,
                        tipo: GENERIC_TIPO,
                        subtipo: GENERIC_SUBTIPO,
                        subsubtipo: GENERIC_SUBSUBTIPO,
                        dominio: generic.dominio,
                        nivelImpacto: generic.nivelImpacto,
                        origenTecnico: generic.origenTecnico,
                        observaciones: generic.observaciones,
                      }));
                      return;
                    }
                    setForm((prev) => ({
                      ...prev,
                      tipo: nextTipo,
                      subtipo: "",
                      subsubtipo: "",
                      dominio: "",
                      nivelImpacto: "Medio",
                      origenTecnico: "",
                      observaciones: "",
                    }));
                  }}
                >
                  <option value="">Selecciona tipo</option>
                  {availableTipos.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo === GENERIC_TIPO ? `${tipo} (sin clasificar)` : tipo}
                    </option>
                  ))}
                </Select>
              </label>
              {isGenericTipo ? null : (
                <>
                  <label className="block space-y-1">
                    <span className="text-label">Subtipo</span>
                    <Select
                      value={form.subtipo}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          subtipo: event.target.value,
                          subsubtipo: "",
                          dominio: "",
                          nivelImpacto: "Medio",
                          origenTecnico: "",
                          observaciones: "",
                        }))
                      }
                      disabled={!form.tipo}
                    >
                      <option value="">Selecciona subtipo</option>
                      {availableSubtipos.map((subtipo) => (
                        <option key={subtipo} value={subtipo}>
                          {subtipo}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-label">Incidencia</span>
                    <Select
                      value={form.subsubtipo}
                      onChange={(event) => {
                        const chosen = tipologias.find(
                          (item) =>
                            item.tipo === form.tipo &&
                            item.subtipo === form.subtipo &&
                            item.subsubtipo === event.target.value,
                        );
                        setForm((prev) => ({
                          ...prev,
                          subsubtipo: event.target.value,
                          dominio: chosen?.dominio ?? "",
                          nivelImpacto: chosen?.nivelImpacto ?? "Medio",
                          origenTecnico: chosen?.origenTecnico ?? "",
                          observaciones: chosen?.observaciones ?? "",
                        }));
                      }}
                      disabled={!form.subtipo}
                    >
                      <option value="">Selecciona incidencia</option>
                      {availableSubsubtipos.map((subsubtipo) => (
                        <option key={subsubtipo} value={subsubtipo}>
                          {subsubtipo}
                        </option>
                      ))}
                    </Select>
                  </label>
                </>
              )}
            </div>
            {isGenericTipo ? (
              <div
                className="mt-3 flex items-start gap-3 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/45 p-3 text-xs text-[var(--color-text-2)]"
                role="status"
              >
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent-light)] text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/30"
                  aria-hidden
                >
                  <Info size={14} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 space-y-1.5">
                  <p className="text-[12.5px] font-semibold text-[var(--color-text-1)]">
                    Tipo gen&eacute;rico seleccionado
                  </p>
                  <p className="leading-relaxed">
                    &Uacute;salo cuando la incidencia <strong>no encaja en ning&uacute;n caso</strong> del cuadro de
                    tipolog&iacute;as. <em>Subtipo</em> e <em>Incidencia</em> no aplican: describe lo ocurrido con
                    todo detalle en el bloque <strong>&ldquo;Detalle de la incidencia&rdquo;</strong> (t&iacute;tulo
                    + descripci&oacute;n). El gestor podr&aacute; reclasificar el ticket m&aacute;s tarde si procede.
                  </p>
                </div>
              </div>
            ) : selectedTipologia ? (
              <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-text-2)]">
                <p>
                  Dominio: <span className="font-medium text-[var(--color-text-1)]">{selectedTipologia.dominio}</span>
                </p>
                <p>
                  Origen tecnico:{" "}
                  <span className="font-medium text-[var(--color-text-1)]">{selectedTipologia.origenTecnico}</span>
                </p>
                <p>
                  Nivel impacto:{" "}
                  <span className="font-medium text-[var(--color-text-1)]">{selectedTipologia.nivelImpacto}</span>
                </p>
              </div>
            ) : null}
          </CollapsibleFormBlock>

          <CollapsibleFormBlock
            title="Detalle de la incidencia"
            stepLabel="3/4"
            subtitle={
              form.title.trim()
                ? `${form.title.trim().slice(0, 48)}${form.title.trim().length > 48 ? "…" : ""}`
                : "Título, descripción e impacto operativo"
            }
            open={formSectionOpen.detail}
            onToggle={() => toggleFormSection("detail")}
          >
            <label className="block space-y-1">
              <span className="text-label">Título</span>
              <Input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Ej: Router sin senal LTE"
              />
            </label>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-label">Descripción técnica</span>
                <VoiceInputButton
                  onTranscript={(text) =>
                    setForm((prev) => ({
                      ...prev,
                      description: prev.description.trim()
                        ? `${prev.description.trimEnd()} ${text}`
                        : text,
                    }))
                  }
                />
              </div>
              <Textarea
                placeholder="Incluye síntomas, contexto y pruebas realizadas."
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="min-h-[80px]"
              />
            </div>

            {kbSuggestions.length > 0 && !kbSuggestDismissed ? (
              <div className="mt-3 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-accent)]">
                    <BookOpen size={13} aria-hidden />
                    ¿Ya está resuelto en la KB?
                  </div>
                  <button
                    type="button"
                    onClick={() => setKbSuggestDismissed(true)}
                    className="text-[11px] text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
                  >
                    Ocultar
                  </button>
                </div>
                <p className="mb-2 text-[11px] text-[var(--color-text-3)]">
                  Artículos relacionados con lo que estás escribiendo. Ábrelos en otra pestaña antes de crear el ticket: a veces el problema ya tiene solución conocida.
                </p>
                <ul className="space-y-1">
                  {kbSuggestions.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/kb/${s.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-start gap-2 rounded-md border border-transparent bg-[var(--color-surface)] px-2.5 py-1.5 text-left transition-colors hover:border-[var(--color-accent)]/30"
                      >
                        <ExternalLink
                          size={12}
                          className="mt-0.5 shrink-0 text-[var(--color-text-3)] group-hover:text-[var(--color-accent)]"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-[var(--color-text-1)]">
                            {s.title}
                          </p>
                          {s.summary ? (
                            <p className="line-clamp-1 text-[11px] text-[var(--color-text-3)]">{s.summary}</p>
                          ) : null}
                        </div>
                        {s.category ? (
                          <span className="hidden shrink-0 rounded-sm bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-text-3)] sm:inline">
                            {s.category}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-label">Ubicación en mapa (opcional)</span>
              </div>
              {mapLocationHint ? (
                <p className="mb-2 text-[12px] text-[var(--color-error)]">{mapLocationHint}</p>
              ) : null}
              <TicketLocationPicker
                mapLatitude={form.mapLatitude}
                mapLongitude={form.mapLongitude}
                mapPlaceMunicipio={form.mapPlaceMunicipio}
                onMapLatitudeChange={(v) => setForm((prev) => ({ ...prev, mapLatitude: v }))}
                onMapLongitudeChange={(v) => setForm((prev) => ({ ...prev, mapLongitude: v }))}
                onMapPlaceMunicipioChange={(v) =>
                  setForm((prev) => ({ ...prev, mapPlaceMunicipio: v?.trim() ? v.trim() : "" }))
                }
                busMunicipio={selectedBus?.municipio ?? ""}
                onNotify={setMapLocationHint}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-label">Líneas afectadas</span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={form.impactedLines}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      impactedLines: Number(event.target.value) || 1,
                    }))
                  }
                />
              </label>
              <div
                onClick={() => setForm((prev) => ({ ...prev, serviceStopped: !prev.serviceStopped }))}
                className={cn(
                  "flex h-full cursor-pointer flex-col justify-center rounded-lg border p-3 transition-all duration-200",
                  form.serviceStopped
                    ? "border-[var(--color-warning)] bg-[var(--color-warning-light)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-hover)]",
                )}
              >
                <span className="mb-1 text-label">Servicio detenido</span>
                <span
                  className={cn(
                    "text-sm font-medium transition-colors",
                    form.serviceStopped ? "text-[var(--color-warning)]" : "text-[var(--color-text-3)]",
                  )}
                >
                  {form.serviceStopped ? "Si — servicio parado" : "No — en servicio"}
                </span>
              </div>
            </div>
          </CollapsibleFormBlock>

          <CollapsibleFormBlock
            title="Adjuntos y notas"
            stepLabel="4/4"
            subtitle={
              stagedUploadFiles.length || form.comment.trim()
                ? `${stagedUploadFiles.length} archivo(s) · comentario ${form.comment.trim() ? "rellenado" : "opcional"}`
                : "Fotos, vídeos y comentario inicial (opcional)"
            }
            open={formSectionOpen.attachments}
            onToggle={() => toggleFormSection("attachments")}
          >
            <div className="space-y-2">
              <span className="text-label">Fotos y vídeos adjuntos</span>
              <p className="text-[12px] leading-snug text-[var(--color-text-3)]">
                Hasta {TICKET_ATTACH_MAX_FILES} archivos · imágenes hasta {Math.round(TICKET_ATTACH_MAX_IMAGE_BYTES / (1024 * 1024))} MB · vídeos hasta {Math.round(TICKET_ATTACH_MAX_VIDEO_BYTES / (1024 * 1024))} MB · tope combinado {Math.round(TICKET_ATTACH_MAX_TOTAL_BYTES / (1024 * 1024))} MB.
                <br />
                Formatos: JPG, PNG, WEBP, GIF · MP4, WEBM, MOV.
              </p>
              <input
                ref={photoFileInputRef}
                type="file"
                accept={TICKET_ATTACH_ACCEPT}
                multiple
                className="sr-only"
                aria-label="Seleccionar imágenes y vídeos adjuntos"
                onChange={handlePhotoInputChange}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="!min-h-0 py-2"
                onClick={() => photoFileInputRef.current?.click()}
              >
                <UploadCloud size={14} aria-hidden />
                Elegir archivos
              </Button>
              {stagedUploadFiles.length > 0 ? (
                <>
                  <ul className="mt-2 space-y-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)]/40 p-2">
                    {stagedUploadFiles.map((file, index) => {
                      const kind = classifyAttachFile(file);
                      const sizeMb = file.size / (1024 * 1024);
                      const sizeLabel = sizeMb >= 1
                        ? `${sizeMb.toFixed(sizeMb >= 10 ? 0 : 1)} MB`
                        : `${Math.max(1, Math.round(file.size / 1024))} KB`;
                      const isVideo = kind === "video";
                      return (
                        <li
                          key={`${file.name}-${file.size}-${index}`}
                          className="flex items-center justify-between gap-2 text-[12px] text-[var(--color-text-1)]"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1",
                                isVideo
                                  ? "bg-[var(--color-accent-light)] text-[var(--color-accent)] ring-[var(--color-accent)]/30"
                                  : "bg-[var(--color-surface-2)] text-[var(--color-text-2)] ring-[var(--color-border)]",
                              )}
                              title={isVideo ? "Vídeo" : "Imagen"}
                              aria-hidden
                            >
                              {isVideo ? <Film size={13} strokeWidth={1.8} /> : <ImageIcon size={13} strokeWidth={1.8} />}
                            </span>
                            <span className="min-w-0 truncate font-mono" title={file.name}>
                              {file.name}
                            </span>
                            <span className="shrink-0 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-3)]">
                              {sizeLabel}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removePhotoAt(index)}
                            className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text-2)] transition-colors duration-200 hover:border-[var(--color-error)]/40 hover:text-[var(--color-error)]"
                          >
                            Quitar
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {(() => {
                    const total = stagedUploadFiles.reduce((sum, f) => sum + f.size, 0);
                    const totalMb = total / (1024 * 1024);
                    const capMb = TICKET_ATTACH_MAX_TOTAL_BYTES / (1024 * 1024);
                    const pct = Math.min(100, (total / TICKET_ATTACH_MAX_TOTAL_BYTES) * 100);
                    const isWarn = pct >= 75;
                    return (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-[10.5px] text-[var(--color-text-3)]">
                          <span>{stagedUploadFiles.length} / {TICKET_ATTACH_MAX_FILES} archivos</span>
                          <span className={cn(isWarn && "font-semibold text-[var(--color-warning)]")}>
                            {totalMb.toFixed(totalMb >= 10 ? 0 : 1)} MB / {capMb.toFixed(0)} MB
                          </span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-300",
                              isWarn ? "bg-[var(--color-warning)]" : "bg-[var(--color-accent)]",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : null}
            </div>

            <Textarea
              label="Comentario inicial"
              placeholder="Notas del operador o técnico."
              value={form.comment}
              onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
              className="min-h-[64px]"
              wrapperClassName="mt-3"
            />
          </CollapsibleFormBlock>

          {/* Asignación y cierre rápido — sugerencias Ibrahim (1b + 1c).
              Solo visible para técnicos y gestores, que son los únicos
              roles que pueden ser asignados y cerrar tickets. */}
          {canActorAssumeTicket ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
              <div className="flex items-center gap-2">
                <span className="text-label">Asignación y cierre</span>
                <span className="text-[10.5px] text-[var(--color-text-3)]">
                  (opcional, atajos para técnicos)
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="group flex cursor-pointer items-start gap-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 transition-colors hover:border-[var(--color-accent)]/40">
                  <input
                    type="checkbox"
                    checked={assignToMe}
                    onChange={(e) => setAssignToMe(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]/40"
                  />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-[var(--color-text-1)]">
                      Asignármelo a mí
                    </span>
                    <span className="block text-[11px] leading-snug text-[var(--color-text-3)]">
                      {sessionUser?.name
                        ? `Marca a ${sessionUser.name} como responsable.`
                        : "Marca al usuario actual como responsable."}
                    </span>
                  </span>
                </label>
                <label className="group flex cursor-pointer items-start gap-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 transition-colors hover:border-emerald-500/40">
                  <input
                    type="checkbox"
                    checked={createAsResolved}
                    onChange={(e) => setCreateAsResolved(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--color-border)] text-emerald-500 focus:ring-emerald-400/40"
                  />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-[var(--color-text-1)]">
                      Crear ya como <span className="text-emerald-300">resuelto</span>
                    </span>
                    <span className="block text-[11px] leading-snug text-[var(--color-text-3)]">
                      Para casos resueltos in situ. Deja trazabilidad sin pasos extra.
                    </span>
                  </span>
                </label>
              </div>
              {createAsResolved ? (
                <Textarea
                  label="Nota de resolución"
                  placeholder="¿Qué se hizo para solucionarlo? Ej: Reinicio del SAE, pieza X sustituida…"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  className="min-h-[56px]"
                  wrapperClassName="mt-2.5"
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="min-h-3 flex-1 xl:min-h-10" aria-hidden />
      </div>

      <div
        className={cn(
          "rounded-lg border-l-4 p-4 transition-all duration-200",
          computedPriority === "alta"
            ? "border-l-[var(--color-error)] bg-[var(--color-error-light)]"
            : computedPriority === "media"
              ? "border-l-[var(--color-warning)] bg-[var(--color-warning-light)]"
              : "border-l-[var(--color-success)] bg-[var(--color-success-light)]",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-label">Prioridad calculada</span>
          {(() => {
            const pr = priorityBadgeProps(computedPriority);
            return (
              <Badge variant={pr.variant} className={cn("whitespace-nowrap", pr.className)}>
                {toUiPriority(computedPriority)}
              </Badge>
            );
          })()}
        </div>
        <p className="mt-1 text-sm text-[var(--color-text-2)]">
          SLA objetivo: <span className="font-medium text-[var(--color-text-1)]">{computedSla} minutos</span>
        </p>
      </div>

      {/* Footer sticky: indicador del siguiente requisito + CTA principal.
       *  Mantiene visible el botón al hacer scroll del formulario largo.   */}
      <div className="-mx-5 -mb-5 mt-3 sticky bottom-0 z-10 rounded-b-xl border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-3 shadow-[0_-10px_28px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        {ticketFormProgress.nextStepIndex !== null ? (
          <p className="mb-2 flex items-center gap-1.5 text-[11px] text-[var(--color-text-3)]" aria-live="polite">
            <span className="h-1 w-1 rounded-full bg-[var(--color-warning)]" />
            Falta:&nbsp;
            <span className="font-medium text-[var(--color-text-2)]">
              {
                (["Equipo con activo", "Tipología completa", "Título (mín. 3 caracteres)", "Descripción (mín. 8)"] as const)[
                  ticketFormProgress.nextStepIndex
                ]
              }
            </span>
          </p>
        ) : (
          <p className="mb-2 flex items-center gap-1.5 text-[11px] text-[var(--color-success)]" aria-live="polite">
            <span className="h-1 w-1 rounded-full bg-[var(--color-success)]" />
            Listo para crear
          </p>
        )}
        <Button
          variant="primary"
          size="lg"
          onClick={() => void submitCreate()}
          disabled={saving || ticketFormProgress.nextStepIndex !== null}
          className="w-full"
        >
          {saving ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              Guardando...
            </>
          ) : createAsResolved ? (
            <>
              <UploadCloud size={16} strokeWidth={1.5} />
              Crear y cerrar
            </>
          ) : (
            <>
              <UploadCloud size={16} strokeWidth={1.5} />
              Crear ticket
            </>
          )}
        </Button>
      </div>
    </motion.article>
  );
}
