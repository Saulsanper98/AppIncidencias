"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  Film,
  ImageIcon,
  MapPin,
  RotateCcw,
  UploadCloud,
  UserRoundCheck,
  Zap,
  CircleCheckBig,
} from "lucide-react";
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
import { toast } from "@/components/toast-host";
import { TicketTemplatePicker } from "@/components/tickets/TicketTemplatePicker";
import { TipologiaPickerSection, applyGenericTipologiaToForm } from "@/components/tickets/TipologiaPickerSection";
import { FalloOrigenPicker, PriorityPicker } from "@/components/tickets/PriorityOriginPickers";
import { BusOperationalContextPanel } from "@/components/tickets/BusOperationalContextPanel";
import { TicketDuplicateAlert } from "@/components/tickets/TicketDuplicateAlert";
import { TypeaheadInput } from "@/components/ui/typeahead-input";
import { DateTimePickerField } from "@/components/ui/datetime-picker-field";
import { VoiceInputButton } from "@/components/ui/VoiceInputButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
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
import { calculateSlaMinutes, toUiPriority } from "@/lib/ticketing";
import { FALLO_ORIGEN_OPTIONS } from "@/lib/fallo-origen";
import type { TicketPriority } from "@/lib/domain";
import {
  GENERIC_TIPO,
  type TipologiaItem,
} from "@/lib/tipologia";
import { priorityBadgeProps } from "@/lib/ticket-ui";
import {
  collectOperatorPrefixes,
  formatPrefixHint,
  validateOptionalLineaLabel,
} from "@/lib/catalog-id-format";
import { resolveBusIdForForm } from "@/lib/ticket-bus-asset";
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

/** Barra de progreso fina (sin caja contenedora). */
function FormProgressBar({
  steps,
  openIndex,
  percent,
  onJump,
}: {
  steps: boolean[];
  openIndex: number;
  percent: number;
  onJump?: (index: number) => void;
}) {
  const labels = ["Equipo", "Tipología", "Detalle", "Adjuntos"] as const;
  return (
    <div className="ticket-form-progress" aria-label="Progreso del borrador">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
          Progreso del borrador
        </span>
        <span className="num-tabular text-[12px] font-semibold text-[var(--color-text-2)]">{percent}%</span>
      </div>
      <div
        className="ticket-form-progress__track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="ticket-form-progress__fill" style={{ width: `${percent}%` }} />
      </div>
      <ul className="ticket-form-progress__steps">
        {labels.map((label, i) => {
          const stepState = steps[i] ? "done" : i === openIndex ? "current" : "pending";
          const content = (
            <>
              <span className="ticket-form-progress__step-num" aria-hidden>
                {steps[i] ? <Check size={11} strokeWidth={2.5} /> : i + 1}
              </span>
              {label}
            </>
          );
          const className = cn(
            "ticket-form-progress__step",
            stepState === "done" && "ticket-form-progress__step--done",
            stepState === "current" && "ticket-form-progress__step--current",
            stepState === "pending" && "ticket-form-progress__step--pending",
            onJump &&
              "cursor-pointer transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
          );
          return (
            <li key={label}>
              {onJump ? (
                <button type="button" onClick={() => onJump(i)} className={className} title={`Ir a ${label}`}>
                  {content}
                </button>
              ) : (
                <span className={className}>{content}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Plantillas + contexto operativo del bus, colapsado por defecto. */
function FormHeaderExtras({
  busId,
  lineaLabel,
}: {
  busId: string;
  lineaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-[var(--color-border)] pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left text-[12px] text-[var(--color-text-2)] transition-colors hover:text-[var(--color-text-1)]"
      >
        <span>
          <span className="font-medium text-[var(--color-accent)]">Más contexto</span>
          <span className="text-[var(--color-text-3)]"> · historial del bus</span>
        </span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-[var(--color-text-3)] transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="mt-3 border-t border-[var(--color-border)]/60 pt-3">
          <BusOperationalContextPanel busId={busId} lineaLabel={lineaLabel} plain />
        </div>
      ) : null}
    </div>
  );
}

/** Sección plana (`account-section`). Plegable solo en móvil. */
function FormSection({
  title,
  subtitle,
  stepLabel,
  sectionId,
  open,
  onToggle,
  sectionValid,
  children,
}: {
  title: string;
  subtitle?: string;
  stepLabel?: string;
  sectionId?: TicketFormSectionId;
  open: boolean;
  onToggle: () => void;
  sectionValid?: boolean;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const expanded = mobile ? open : true;

  const heading = (
    <>
      <span
        className="account-section-icon"
        style={{ ["--section-tone" as string]: "var(--color-accent)" }}
        aria-hidden
      >
        {stepLabel ? stepLabel.split("/")[0] : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="account-section-pretitle">
          <span
            className="account-section-pretitle-dot"
            style={{ ["--section-tone" as string]: "var(--color-accent)" }}
            aria-hidden
          />
          Paso {stepLabel ?? ""}
        </p>
        <h3 className="account-section-title !text-base sm:!text-[1.05rem]">
          {title}
          {sectionValid ? (
            <Check
              size={15}
              strokeWidth={2.5}
              className="ml-1.5 inline shrink-0 text-[var(--color-success)]"
              aria-label="Completado"
            />
          ) : null}
        </h3>
        {subtitle ? <p className="mt-0.5 truncate text-caption text-[var(--color-text-3)]">{subtitle}</p> : null}
      </div>
      {mobile ? (
        <ChevronDown
          size={18}
          className={cn(
            "shrink-0 text-[var(--color-text-3)] transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      ) : null}
    </>
  );

  return (
    <section
      id={sectionId ? `ticket-form-section-${sectionId}` : undefined}
      className="ticket-form-section scroll-mt-4 border-b border-[var(--color-border)] py-5 last:border-b-0"
    >
      {mobile ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="account-section-head w-full text-left transition-colors hover:bg-[var(--color-surface-2)]/30"
        >
          {heading}
        </button>
      ) : (
        <header className="account-section-head">{heading}</header>
      )}
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="body"
            initial={mobile && !reduceMotion ? { height: 0, opacity: 0.6 } : false}
            animate={{ height: "auto", opacity: 1 }}
            exit={mobile && !reduceMotion ? { height: 0, opacity: 0.6 } : undefined}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            className={expanded ? "overflow-visible" : "overflow-hidden"}
          >
            <div className="ticket-form-section__body mt-4 space-y-4">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
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
  /** Dentro de un desplegable en Gestión (sin marco ni título duplicado). */
  embedded?: boolean;
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
  embedded = false,
}: TicketCreateFormProps) {
  const [form, setForm] = useState<FormState>(defaultForm());
  const [formSectionOpen, setFormSectionOpen] = useState<Record<TicketFormSectionId, boolean>>(() =>
    normalizeAccordionOpen(undefined, "equipment"),
  );

  // En escritorio mostramos todas las secciones abiertas (formulario continuo).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const expandAll = () => {
      if (mq.matches) {
        setFormSectionOpen({
          equipment: true,
          tipologia: true,
          detail: true,
          attachments: true,
        });
      }
    };
    expandAll();
    mq.addEventListener("change", expandAll);
    return () => mq.removeEventListener("change", expandAll);
  }, []);

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
  const titleInvalid = form.title.trim().length > 0 && form.title.trim().length < 3;
  const catalogPrefixes = useMemo(
    () => collectOperatorPrefixes([...catalog.map((bus) => bus.id), ...lineas]),
    [catalog, lineas],
  );
  const busIdValidation = useMemo(
    () => resolveBusIdForForm(trimmedBusId, catalog.map((bus) => bus.id), catalogPrefixes),
    [trimmedBusId, catalog, catalogPrefixes],
  );
  const lineaValidation = useMemo(
    () => validateOptionalLineaLabel(form.lineaLabel, lineas, catalogPrefixes),
    [form.lineaLabel, lineas, catalogPrefixes],
  );
  const selectedBus = useMemo(() => catalog.find((bus) => bus.id === trimmedBusId), [catalog, trimmedBusId]);
  /**
   * Pedro pidió poder teclear un bus que no esté en el catálogo. Si el usuario
   * escribe algo que no coincide con ningún bus existente, lo marcamos como
   * "nuevo": al guardar, el backend lo creará al vuelo con un activo
   * SAE-DEFAULT y se ocultará el selector de activo.
   */
  const isNewBus = busIdValidation.ok && "isNew" in busIdValidation && busIdValidation.isNew;
  const busTypeaheadOptions = useMemo(
    () =>
      catalog.map((bus) => ({
        value: bus.id,
        hint: [bus.operator || "Sin asignar", bus.municipio].filter(Boolean).join(" · "),
      })),
    [catalog],
  );
  const lineaTypeaheadOptions = useMemo(
    () =>
      Array.from(new Set([...(selectedBus?.lineas ?? []), ...lineas])).map((linea) => ({
        value: linea,
      })),
    [selectedBus?.lineas, lineas],
  );
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
  const selectedTipologia = useMemo(
    () =>
      tipologias.find(
        (item) => item.tipo === form.tipo && item.subtipo === form.subtipo && item.subsubtipo === form.subsubtipo,
      ),
    [tipologias, form.tipo, form.subtipo, form.subsubtipo],
  );

  const applyTipologiaSelection = useCallback((item: TipologiaItem) => {
    const suggestedPriority: TicketPriority =
      item.nivelImpacto === "Alto" ? "alta" : item.nivelImpacto === "Bajo" ? "baja" : "media";
    setForm((prev) => ({
      ...prev,
      tipo: item.tipo,
      subtipo: item.subtipo,
      subsubtipo: item.subsubtipo,
      dominio: item.dominio,
      nivelImpacto: item.nivelImpacto,
      origenTecnico: item.origenTecnico,
      observaciones: item.observaciones,
      // Sugerencia al elegir tipología; el técnico puede cambiarla después.
      priority: suggestedPriority,
    }));
  }, []);

  const resetTipologiaForSearch = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      tipo: "",
      subtipo: "",
      subsubtipo: "",
      dominio: "",
      nivelImpacto: "Medio",
      origenTecnico: "",
      observaciones: "",
    }));
  }, []);

  const computedSla =
    selectedAsset?.slaMinutes != null && selectedAsset.slaMinutes > 0
      ? selectedAsset.slaMinutes
      : calculateSlaMinutes(form.priority, slaOverride);
  const ticketFormProgress = useMemo(() => {
    const equipmentValid = busIdValidation.ok && lineaValidation.ok;
    const checks = [
      equipmentValid,
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
  }, [form, busIdValidation, lineaValidation]);
  const equipmentMissingHint = useMemo(() => {
    if (!trimmedBusId) return "Bus";
    if (!busIdValidation.ok) return "Bus con prefijo de operadora";
    if (!lineaValidation.ok) return "Línea con prefijo de operadora";
    return "Equipo indicado";
  }, [trimmedBusId, busIdValidation, lineaValidation]);

  const reduceMotionUi = useReducedMotion();
  const prevFormProgressFilledRef = useRef(ticketFormProgress.filled);
  const clearConfirmCancelRef = useRef<HTMLButtonElement>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const hasMapPin = Boolean(form.mapLatitude.trim() && form.mapLongitude.trim());

  useEffect(() => {
    prevFormProgressFilledRef.current = ticketFormProgress.filled;
  }, [ticketFormProgress.filled]);

  const jumpToFormSection = useCallback((index: number) => {
    const id = TICKET_FORM_SECTION_ORDER[index];
    if (!id) return;
    setFormSectionOpen({
      equipment: id === "equipment",
      tipologia: id === "tipologia",
      detail: id === "detail",
      attachments: id === "attachments",
    });
    requestAnimationFrame(() => {
      document.getElementById(`ticket-form-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

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

  const isFormDirty = useMemo(() => {
    if (stagedUploadFiles.length > 0) return true;
    if (createAsResolved || resolutionNote.trim()) return true;
    if (form.comment.trim()) return true;
    if (form.lineaLabel.trim() || form.servicioLabel.trim() || form.conductorLabel.trim()) return true;
    if (form.mapLatitude.trim() || form.mapLongitude.trim() || form.mapPlaceMunicipio.trim()) return true;
    if (ticketFormProgress.filled > 0) return true;
    return false;
  }, [form, stagedUploadFiles, createAsResolved, resolutionNote, ticketFormProgress.filled]);

  const performClearTicketForm = useCallback(() => {
    const startingBus = catalog[0]?.id ?? "";
    setForm(defaultForm(startingBus));
    setStagedUploadFiles([]);
    setFormSectionOpen(normalizeAccordionOpen(undefined, "equipment"));
    setCreateAsResolved(false);
    setResolutionNote("");
    setAssignToMe(canActorAssumeTicket);
    setKbSuggestions([]);
    setKbSuggestDismissed(false);
    setMapLocationHint(null);
    prevFormProgressFilledRef.current = 0;
    lastSectionRef.current = null;
    try {
      sessionStorage.removeItem(TICKET_FORM_DRAFT_KEY);
    } catch {
      /* cuota o modo privado */
    }
    createFlow.start();
    setClearConfirmOpen(false);
    toast.info("Formulario limpio");
  }, [catalog, canActorAssumeTicket, createFlow]);

  const requestClearTicketForm = useCallback(() => {
    if (isFormDirty) {
      setClearConfirmOpen(true);
      return;
    }
    performClearTicketForm();
  }, [isFormDirty, performClearTicketForm]);

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
            incidentOccurredAt:
              typeof d.incidentOccurredAt === "string" && d.incidentOccurredAt.trim()
                ? d.incidentOccurredAt
                : defaultForm().incidentOccurredAt,
            priority:
              d.priority === "alta" || d.priority === "media" || d.priority === "baja"
                ? d.priority
                : "media",
            falloOrigen:
              d.falloOrigen === "maquina" ||
              d.falloOrigen === "conductor" ||
              d.falloOrigen === "externo"
                ? d.falloOrigen
                : "maquina",
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
    if (!form.incidentOccurredAt.trim() || Number.isNaN(new Date(form.incidentOccurredAt).getTime())) {
      setError("Indica la hora de la incidencia.");
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
    <article
      id="tickets-new-form-anchor"
      className={cn(
        "ticket-form-shell flex min-h-0 flex-col",
        embedded
          ? "bg-transparent p-0 xl:col-span-full xl:min-h-0"
          : "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 xl:col-span-5 xl:min-h-[min(520px,68vh)]",
      )}
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
      {/* Cabecera plana: título, identidad inline y progreso */}
      <header className={cn("mb-1 space-y-3 border-b border-[var(--color-border)] pb-4", embedded && "sr-only")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="tickets-new-form-title" className="text-lg font-semibold leading-tight text-[var(--color-text-1)]">
              Nuevo ticket
            </h3>
            <div className="ticket-form-identity-row">
              <span className="ticket-form-identity-chip ticket-form-identity-chip--bus">
                {busIdValidation.ok ? busIdValidation.normalized : trimmedBusId || "Sin bus"}
              </span>
              {isNewBus ? (
                <span className="ticket-form-identity-chip ticket-form-identity-chip--new" title="Se creará en catálogo al guardar">
                  nuevo
                </span>
              ) : null}
              <span className="ticket-form-identity-chip ticket-form-identity-chip--asset">
                {selectedAsset
                  ? `${selectedAsset.id} (${selectedAsset.type})`
                  : isNewBus
                    ? "SAE por defecto"
                    : selectedBus
                      ? "Selecciona activo"
                      : "Bus o activo"}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={requestClearTicketForm}
              disabled={!formDraftHydrated || saving}
              className="ccmgc-form-clear-btn"
              title="Limpiar borrador y empezar de cero"
              aria-label="Limpiar borrador y empezar de cero"
            >
              <RotateCcw size={13} strokeWidth={2} aria-hidden />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
            <FeedbackTargetButton id="tickets/formulario-nuevo" label="Formulario de nuevo ticket" />
          </div>
        </div>

        <FormProgressBar
          steps={ticketFormProgress.checks}
          openIndex={TICKET_FORM_SECTION_ORDER.findIndex((id) => formSectionOpen[id])}
          percent={ticketFormProgress.pct}
          onJump={jumpToFormSection}
        />

        <FormHeaderExtras busId={trimmedBusId} lineaLabel={form.lineaLabel} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div>
          <FormSection
            sectionId="equipment"
            title="Equipo afectado"
            stepLabel="1/4"
            sectionValid={ticketFormProgress.checks[0]}
            subtitle={
              selectedBus
                ? [
                    selectedBus.operator ? selectedBus.operator : null,
                    selectedBus.municipio ? selectedBus.municipio : null,
                    form.lineaLabel.trim() ? `Línea ${form.lineaLabel.trim()}` : null,
                    form.servicioLabel.trim() ? `Servicio ${form.servicioLabel.trim()}` : null,
                    form.conductorLabel.trim() ? form.conductorLabel.trim() : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Línea, servicio y conductor (opcional)"
                : isNewBus
                  ? "Bus nuevo en catálogo al guardar"
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
            <div className="ticket-form-panel">
              <TicketTemplatePicker
                form={form}
                setForm={setForm}
                sessionUser={sessionUser}
                tipologias={tipologias}
              />
              <div className="ticket-form-equipment-grid">
              <label className="block space-y-1">
                <span className="text-label">Bus</span>
                <TypeaheadInput
                  value={form.busId}
                  onValueChange={(next) => setForm((prev) => ({ ...prev, busId: next, assetId: "" }))}
                  options={busTypeaheadOptions}
                  maxSuggestions={15}
                  placeholder={catalogPrefixes.length ? `Ej: ${formatPrefixHint(catalogPrefixes)}` : "Ej: GF-11018"}
                  autoComplete="off"
                  spellCheck={false}
                  emptyMessage="Sin buses en catálogo con ese criterio"
                  aria-invalid={trimmedBusId !== "" && !busIdValidation.ok}
                />
                {trimmedBusId && !busIdValidation.ok ? (
                  <p className="text-[11px] leading-snug text-[var(--color-danger)]" role="alert">
                    {busIdValidation.message}
                  </p>
                ) : null}
              </label>
              <label className="block space-y-1">
                <span className="text-label">
                  Línea
                  <span className="ml-1 text-[10px] font-normal text-[var(--color-text-3)]">(opcional)</span>
                </span>
                <TypeaheadInput
                  value={form.lineaLabel}
                  onValueChange={(next) => setForm((prev) => ({ ...prev, lineaLabel: next }))}
                  options={lineaTypeaheadOptions}
                  maxSuggestions={15}
                  placeholder={catalogPrefixes.length ? `Ej: ${formatPrefixHint(catalogPrefixes)}` : "Ej: GL-1, GL-30…"}
                  maxLength={120}
                  autoComplete="off"
                  spellCheck={false}
                  emptyMessage="Sin líneas con ese criterio"
                  aria-invalid={form.lineaLabel.trim() !== "" && !lineaValidation.ok}
                />
                {form.lineaLabel.trim() && !lineaValidation.ok ? (
                  <p className="text-[11px] leading-snug text-[var(--color-danger)]" role="alert">
                    {lineaValidation.message}
                  </p>
                ) : null}
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
                  <span className="ml-1 text-[10px] font-normal text-[var(--color-text-3)]">(ID)</span>
                </span>
                <Input
                  value={form.conductorLabel}
                  onChange={(event) => setForm((prev) => ({ ...prev, conductorLabel: event.target.value }))}
                  placeholder="ID conductor"
                  maxLength={120}
                  autoComplete="off"
                />
              </label>
              <div className="block space-y-1 sm:col-span-2">
                <label htmlFor="ticket-incident-at" className="text-label">
                  Hora de la incidencia <span className="text-[var(--color-error)]">*</span>
                </label>
                <DateTimePickerField
                  id="ticket-incident-at"
                  value={form.incidentOccurredAt}
                  onChange={(next) => setForm((prev) => ({ ...prev, incidentOccurredAt: next }))}
                  ariaLabel="Hora de la incidencia"
                />
                <p className="text-[11px] text-[var(--color-text-3)]">Puede ser distinta a la hora de registro.</p>
              </div>
              </div>
            </div>

            {isNewBus ? (
              <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] leading-snug text-amber-100">
                <span className="font-medium">Bus nuevo:</span> al guardar se creará{" "}
                <span className="font-mono">{busIdValidation.normalized}</span> en el catálogo. Usa el prefijo de la
                operadora ({formatPrefixHint(catalogPrefixes)}). El gestor podrá completar operador, municipio y líneas
                más tarde desde Administración → Catálogo.
              </p>
            ) : null}
          </FormSection>

          <FormSection
            sectionId="tipologia"
            title="Tipología de incidencia"
            stepLabel="2/4"
            sectionValid={ticketFormProgress.checks[1]}
            subtitle={
              isGenericTipo
                ? "Sin clasificar — describe en Detalle"
                : form.subsubtipo
                  ? `${form.tipo} · ${form.subtipo}`
                  : "Tipo, subtipo e incidencia"
            }
            open={formSectionOpen.tipologia}
            onToggle={() => toggleFormSection("tipologia")}
          >
            <div className="ticket-form-panel">
              <TipologiaPickerSection
                tipologias={tipologias}
                isGenericTipo={isGenericTipo}
                tipo={form.tipo}
                subtipo={form.subtipo}
                availableTipos={availableTipos}
                availableSubtipos={availableSubtipos}
                selectedTipologia={selectedTipologia}
                onSelect={applyTipologiaSelection}
                onSearchStart={resetTipologiaForSearch}
                onTipoChange={(nextTipo) =>
                  setForm((prev) => ({
                    ...prev,
                    tipo: nextTipo,
                    subtipo: "",
                    subsubtipo: "",
                    dominio: "",
                    nivelImpacto: "Medio",
                    origenTecnico: "",
                    observaciones: "",
                  }))
                }
                onSubtipoChange={(nextSubtipo) =>
                  setForm((prev) => ({
                    ...prev,
                    subtipo: nextSubtipo,
                    subsubtipo: "",
                    dominio: "",
                    nivelImpacto: "Medio",
                    origenTecnico: "",
                    observaciones: "",
                  }))
                }
                onGenericTipoSelect={() => setForm((prev) => ({ ...prev, ...applyGenericTipologiaToForm() }))}
              />
            </div>
            {isGenericTipo ? (
              <details className="mt-3 text-[12px] text-[var(--color-text-2)]">
                <summary className="cursor-pointer font-medium text-[var(--color-accent)] hover:underline">
                  Tipo genérico — ¿cuándo usarlo?
                </summary>
                <p className="mt-2 leading-relaxed text-[var(--color-text-3)]">
                  Úsalo cuando la incidencia no encaja en el cuadro de tipologías. Subtipo e incidencia quedan
                  bloqueados: describe lo ocurrido en <strong className="text-[var(--color-text-2)]">Detalle</strong>{" "}
                  (título + descripción). El gestor podrá reclasificar el ticket más tarde.
                </p>
              </details>
            ) : null}
          </FormSection>

          <FormSection
            sectionId="detail"
            title="Detalle de la incidencia"
            stepLabel="3/4"
            sectionValid={ticketFormProgress.checks[2] && ticketFormProgress.checks[3]}
            subtitle={
              form.title.trim()
                ? `${form.title.trim().slice(0, 48)}${form.title.trim().length > 48 ? "…" : ""}`
                : "Título, descripción e impacto operativo"
            }
            open={formSectionOpen.detail}
            onToggle={() => toggleFormSection("detail")}
          >
            <TicketDuplicateAlert
              busId={trimmedBusId}
              title={form.title}
              description={form.description}
              tipo={form.tipo}
              subtipo={form.subtipo}
            />

            <div className="ticket-form-panel">
            <label className="block space-y-1">
              <span className="text-label">Título</span>
              <Input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Ej: Router sin senal LTE"
                className={cn(titleInvalid && "ccmgc-input-error")}
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
                className="min-h-[96px]"
              />
            </div>
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

            <div className="ticket-form-map-panel">
              <div className="ticket-form-map-panel__head">
                <span className="ticket-form-map-panel__icon" aria-hidden>
                  <MapPin size={16} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="ticket-form-map-panel__title">Ubicación en mapa</p>
                  <p className="ticket-form-map-panel__hint">
                    Marca el punto de la incidencia en Gran Canaria. Opcional, pero ayuda en desplazamientos y reportes.
                  </p>
                </div>
                {hasMapPin ? <span className="ticket-form-map-panel__badge">Pin colocado</span> : null}
              </div>
              <div className="ticket-form-map-panel__body">
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
            </div>

            <div className="ticket-form-impact-panel">
              <div className="block space-y-1">
                <span className="text-label">Prioridad</span>
                <PriorityPicker
                  value={form.priority}
                  onChange={(priority) => setForm((prev) => ({ ...prev, priority }))}
                  aria-label="Prioridad del ticket"
                />
                <p className="text-[11px] text-[var(--color-text-3)]">
                  La elige el técnico. SLA estimado: {computedSla} min.
                </p>
              </div>
              <div className="block space-y-1">
                <span className="text-label">Origen del fallo</span>
                <FalloOrigenPicker
                  value={form.falloOrigen}
                  onChange={(falloOrigen) => setForm((prev) => ({ ...prev, falloOrigen }))}
                  aria-label="Origen del fallo"
                />
                <p className="text-[11px] text-[var(--color-text-3)]">
                  {FALLO_ORIGEN_OPTIONS.find((o) => o.value === form.falloOrigen)?.hint}
                </p>
              </div>
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
              <label className="ticket-form-impact-panel__stop">
                <input
                  type="checkbox"
                  checked={form.serviceStopped}
                  onChange={(e) => setForm((prev) => ({ ...prev, serviceStopped: e.target.checked }))}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--color-border)] text-[var(--color-warning)] focus:ring-[var(--color-warning)]/40"
                />
                <span className="min-w-0">
                  <span className="block text-label">Servicio detenido</span>
                  <span
                    className={cn(
                      "block text-[11px] leading-snug",
                      form.serviceStopped ? "font-medium text-[var(--color-warning)]" : "text-[var(--color-text-3)]",
                    )}
                  >
                    {form.serviceStopped ? "Sí — servicio parado" : "No — en servicio"}
                  </span>
                </span>
              </label>
            </div>
          </FormSection>

          <FormSection
            sectionId="attachments"
            title="Adjuntos y notas"
            stepLabel="4/4"
            sectionValid={ticketFormProgress.nextStepIndex === null}
            subtitle={
              stagedUploadFiles.length || form.comment.trim()
                ? `${stagedUploadFiles.length} archivo(s) · comentario ${form.comment.trim() ? "rellenado" : "opcional"}`
                : "Fotos, vídeos y comentario inicial (opcional)"
            }
            open={formSectionOpen.attachments}
            onToggle={() => toggleFormSection("attachments")}
          >
            <div className="ticket-form-panel ticket-form-attach-panel">
              <div className="ticket-form-attach-intro">
                <span className="text-label">Fotos y vídeos adjuntos</span>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-text-3)]">
                  Hasta {TICKET_ATTACH_MAX_FILES} archivos · imágenes hasta{" "}
                  {Math.round(TICKET_ATTACH_MAX_IMAGE_BYTES / (1024 * 1024))} MB · vídeos hasta{" "}
                  {Math.round(TICKET_ATTACH_MAX_VIDEO_BYTES / (1024 * 1024))} MB · tope combinado{" "}
                  {Math.round(TICKET_ATTACH_MAX_TOTAL_BYTES / (1024 * 1024))} MB.
                </p>
              </div>
              <input
                ref={photoFileInputRef}
                type="file"
                accept={TICKET_ATTACH_ACCEPT}
                multiple
                className="sr-only"
                aria-label="Seleccionar imágenes y vídeos adjuntos"
                onChange={handlePhotoInputChange}
              />
              <div className="ticket-form-upload-zone">
                <span className="ticket-form-upload-zone__icon" aria-hidden>
                  <UploadCloud size={18} strokeWidth={1.8} />
                </span>
                <p className="text-[12px] text-[var(--color-text-2)]">
                  Arrastra archivos o selecciónalos desde tu dispositivo
                </p>
                <p className="text-[10.5px] text-[var(--color-text-3)]">
                  JPG, PNG, WEBP, GIF · MP4, WEBM, MOV
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-1 !min-h-0 py-2"
                  onClick={() => photoFileInputRef.current?.click()}
                >
                  Elegir archivos
                </Button>
              </div>
              {stagedUploadFiles.length > 0 ? (
                <>
                  <ul className="mt-4 space-y-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)]/40 p-2">
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
          </FormSection>

          {/* Asignación y cierre rápido — sugerencias Ibrahim (1b + 1c).
              Solo visible para técnicos y gestores, que son los únicos
              roles que pueden ser asignados y cerrar tickets. */}
          {canActorAssumeTicket ? (
            <section className="ticket-form-section ticket-form-shortcuts-panel border-b border-[var(--color-border)] py-5 last:border-b-0">
              <header className="ticket-form-shortcuts-head">
                <span className="ticket-form-shortcuts-head__icon" aria-hidden>
                  <Zap size={16} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="ticket-form-shortcuts-head__eyebrow">Atajos opcionales</p>
                  <h3 className="ticket-form-shortcuts-head__title">Asignación y cierre rápido</h3>
                  <p className="ticket-form-shortcuts-head__hint">
                    Acelera el alta cuando ya sabes quién lo atiende o si quedó resuelto en el acto.
                  </p>
                </div>
              </header>
              <div className="ticket-form-shortcuts-grid">
                <label
                  className={cn(
                    "ticket-form-shortcut-card ticket-form-shortcut-card--assign",
                    assignToMe && "ticket-form-shortcut-card--active",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={assignToMe}
                    onChange={(e) => setAssignToMe(e.target.checked)}
                    className="sr-only"
                  />
                  <span className="ticket-form-shortcut-card__icon" aria-hidden>
                    <UserRoundCheck size={17} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="ticket-form-shortcut-card__title">Asignármelo a mí</span>
                    <span className="ticket-form-shortcut-card__desc">
                      {sessionUser?.name
                        ? `Te marca a ti (${sessionUser.name}) como responsable.`
                        : "Marca al usuario actual como responsable."}
                    </span>
                  </span>
                  <span className="ticket-form-shortcut-card__toggle" aria-hidden />
                </label>
                <label
                  className={cn(
                    "ticket-form-shortcut-card ticket-form-shortcut-card--resolve",
                    createAsResolved && "ticket-form-shortcut-card--active",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={createAsResolved}
                    onChange={(e) => setCreateAsResolved(e.target.checked)}
                    className="sr-only"
                  />
                  <span className="ticket-form-shortcut-card__icon ticket-form-shortcut-card__icon--resolve" aria-hidden>
                    <CircleCheckBig size={17} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="ticket-form-shortcut-card__title">
                      Crear ya como <span className="text-emerald-300">resuelto</span>
                    </span>
                    <span className="ticket-form-shortcut-card__desc">
                      Para incidencias cerradas in situ, sin pasos extra en la bandeja.
                    </span>
                  </span>
                  <span className="ticket-form-shortcut-card__toggle" aria-hidden />
                </label>
              </div>
              {createAsResolved ? (
                <div className="ticket-form-shortcuts-resolve-note">
                  <Textarea
                    label="Nota de resolución"
                    placeholder="¿Qué se hizo para solucionarlo? Ej: Reinicio del SAE, pieza X sustituida…"
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    className="min-h-[56px]"
                  />
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
        <div className="min-h-3 flex-1 xl:min-h-10" aria-hidden />
      </div>

      <div
        className={cn(
          "ticket-form-footer -mx-4 -mb-4 mt-4 sticky bottom-0 z-10 rounded-b-xl border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:-mx-5 sm:-mb-5",
        )}
      >
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {ticketFormProgress.nextStepIndex !== null ? (
            <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--color-text-3)]" aria-live="polite">
              <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--color-warning)]" />
              Falta:&nbsp;
              <span className="font-medium text-[var(--color-text-2)]">
                {
                  (
                    [
                      equipmentMissingHint,
                      "Tipología completa",
                      "Título (mín. 3 caracteres)",
                      "Descripción (mín. 8)",
                    ] as const
                  )[ticketFormProgress.nextStepIndex]
                }
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-success)]" aria-live="polite">
              <span className="h-1 w-1 rounded-full bg-[var(--color-success)]" />
              Listo para crear
            </p>
          )}
          <div className="flex shrink-0 items-center gap-2 text-[11px]">
            <span className="text-[var(--color-text-3)]">
              SLA <span className="num-tabular font-medium text-[var(--color-text-2)]">{computedSla}m</span>
            </span>
            {(() => {
              const pr = priorityBadgeProps(form.priority);
              return (
                <Badge
                  key={form.priority}
                  variant={pr.variant}
                  className={cn(
                    "whitespace-nowrap transition-all duration-300",
                    !reduceMotionUi && "ccmgc-badge-pop",
                    pr.className,
                  )}
                >
                  {toUiPriority(form.priority)}
                </Badge>
              );
            })()}
          </div>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => void submitCreate()}
          disabled={saving || ticketFormProgress.nextStepIndex !== null}
          className="ccmgc-primary-cta w-full"
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

      <ModalShell
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        size="md"
        initialFocusRef={clearConfirmCancelRef}
        title={
          <span className="flex items-center gap-2 text-base font-semibold">
            <RotateCcw size={16} className="text-[var(--color-warning)]" aria-hidden />
            Limpiar borrador
          </span>
        }
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              ref={clearConfirmCancelRef}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setClearConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={performClearTicketForm}>
              Limpiar y empezar de cero
            </Button>
          </div>
        }
      >
        <p className="text-body text-[var(--color-text-2)]">
          Se perderán todos los datos del formulario que estás rellenando: tipología, detalle, adjuntos y notas.
        </p>
        <p className="mt-2 text-caption text-[var(--color-text-3)]">Esta acción no se puede deshacer.</p>
      </ModalShell>
    </article>
  );
}
