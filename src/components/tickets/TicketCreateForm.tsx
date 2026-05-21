"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Plus, UploadCloud } from "lucide-react";
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
  TICKET_ATTACH_MAX_BYTES,
  TICKET_ATTACH_MAX_FILES,
  TICKET_FORM_DRAFT_KEY,
  TICKET_FORM_SECTION_ORDER,
  defaultForm,
  normalizeAccordionOpen,
} from "@/components/tickets/tickets-module-types";
import type { SessionUser } from "@/lib/domain";
import { calculatePriority, calculateSlaMinutes, toUiPriority } from "@/lib/ticketing";
import type { TipologiaItem } from "@/lib/tipologia";
import { priorityBadgeProps } from "@/lib/ticket-ui";
import { cn } from "@/lib/utils";

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
  const [formDraftHydrated, setFormDraftHydrated] = useState(false);
  const [stagedUploadFiles, setStagedUploadFiles] = useState<File[]>([]);
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const [mapLocationHint, setMapLocationHint] = useState<string | null>(null);

  const selectedBus = useMemo(() => catalog.find((bus) => bus.id === form.busId), [catalog, form.busId]);
  const availableAssets = selectedBus?.assets ?? [];
  const selectedAsset = availableAssets.find((asset) => asset.id === form.assetId);
  const availableTipos = useMemo(
    () => Array.from(new Set(tipologias.map((item) => item.tipo))).sort((a, b) => a.localeCompare(b)),
    [tipologias],
  );
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
    if (!selectedAsset) {
      return "baja";
    }
    return calculatePriority({
      assetType: selectedAsset.type,
      impactedLines: form.impactedLines,
      serviceStopped: form.serviceStopped,
      nivelImpacto: form.nivelImpacto,
    });
  }, [selectedAsset, form.impactedLines, form.serviceStopped, form.nivelImpacto]);

  const computedSla =
    selectedAsset?.slaMinutes != null && selectedAsset.slaMinutes > 0
      ? selectedAsset.slaMinutes
      : calculateSlaMinutes(computedPriority);
  const ticketFormProgress = useMemo(() => {
    const checks = [
      Boolean(form.busId && form.assetId),
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
  }, [form]);

  const reduceMotionUi = useReducedMotion();
  const prevFormProgressFilledRef = useRef(ticketFormProgress.filled);
  const [draftStepFlashIndex, setDraftStepFlashIndex] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevFormProgressFilledRef.current;
    if (ticketFormProgress.filled > prev) {
      setDraftStepFlashIndex(ticketFormProgress.filled - 1);
      const t = window.setTimeout(() => setDraftStepFlashIndex(null), 700);
      prevFormProgressFilledRef.current = ticketFormProgress.filled;
      return () => window.clearTimeout(t);
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

  const goToNextIncompleteFormStep = useCallback(() => {
    const idx = ticketFormProgress.nextStepIndex;
    if (idx === null) return;
    const id = TICKET_FORM_SECTION_ORDER[idx];
    setFormSectionOpen({
      equipment: id === "equipment",
      tipologia: id === "tipologia",
      detail: id === "detail",
      attachments: id === "attachments",
    });
    window.setTimeout(() => {
      document.getElementById("tickets-new-form-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [ticketFormProgress.nextStepIndex]);

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
          const busOk = catalog.some((b) => b.id === d.busId);
          const busId = busOk ? d.busId : catalog[0].id;
          const assets = catalog.find((b) => b.id === busId)?.assets ?? [];
          const assetOk = assets.some((a) => a.id === d.assetId);
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
          });
          setStagedUploadFiles([]);
          if (parsed.openSections) {
            setFormSectionOpen(normalizeAccordionOpen(parsed.openSections));
          }
        }
      }
    } catch {
      /* borrador corrupto */
    }
    setForm((prev) => {
      if (catalog.length === 0) return prev;
      if (catalog.some((b) => b.id === prev.busId) && prev.busId) return prev;
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
    for (const file of Array.from(list)) {
      if (file.size > TICKET_ATTACH_MAX_BYTES) {
        errors.push(`${file.name} supera ${Math.round(TICKET_ATTACH_MAX_BYTES / (1024 * 1024))} MB.`);
        continue;
      }
      if (!file.type.startsWith("image/")) {
        errors.push(`${file.name}: solo imágenes.`);
        continue;
      }
      if (file.name.trim()) accepted.push(file);
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
    if (!sessionUser || !selectedBus || !selectedAsset || !selectedTipologia) {
      if (!sessionUser) setError("Debes iniciar sesión para crear tickets.");
      return;
    }
    await onCreateTicket({
      form,
      stagedUploadFiles,
      selectedBus,
      selectedAsset,
      selectedTipologia,
      onTicketCreated: () => {
        setForm((prev) => ({ ...defaultForm(prev.busId), busId: prev.busId }));
        setStagedUploadFiles([]);
        setFormSectionOpen(normalizeAccordionOpen(undefined, "equipment"));
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
      <div className="mb-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-light)]">
            <Plus size={16} className="text-[var(--color-accent)]" />
          </div>
          <div>
            <h3 id="tickets-new-form-title" className="text-subheading">
              Nuevo ticket
            </h3>
            <p className="text-sm leading-snug text-[var(--color-text-3)]">Ancla la incidencia a un bus y activo concreto</p>
          </div>
        </div>
        <FeedbackTargetButton id="tickets/formulario-nuevo" label="Formulario de nuevo ticket" />
      </div>

      <div className="mb-4 rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-surface-2)]/60 px-3 py-2.5 text-[12px] leading-snug text-[var(--color-text-2)]">
        <span className="font-mono font-medium text-[var(--color-text-1)]">{selectedBus?.id ?? "—"}</span>
        <span className="text-[var(--color-text-3)]"> · </span>
        <span>
          {selectedAsset
            ? `${selectedAsset.id} (${selectedAsset.type})`
            : selectedBus
              ? "Selecciona activo"
              : "Selecciona bus"}
        </span>
        <span className="text-[var(--color-text-3)]"> · </span>
        <span className="tabular-nums font-semibold text-[var(--color-text-1)]">Borrador {ticketFormProgress.pct}%</span>
      </div>

      <div
        className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-3 py-3"
        aria-label="Progreso del borrador del formulario"
      >
        <div className="mb-2 flex items-center justify-between gap-2 text-caption text-[var(--color-text-2)]">
          <span className="font-medium text-[var(--color-text-1)]">Borrador</span>
          <span className="tabular-nums text-[var(--color-text-1)]">
            {ticketFormProgress.filled}/{ticketFormProgress.total} · {ticketFormProgress.pct}%
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
          <div
            className="h-3 rounded-full bg-[var(--color-accent)] transition-[width] duration-200 ease-out"
            style={{ width: `${ticketFormProgress.pct}%` }}
          />
        </div>
        <div className="mt-2.5 flex gap-1.5">
          {(["Equipo", "Tipo", "Título", "Desc"] as const).map((label, i) => {
            const done = ticketFormProgress.checks[i];
            const active = !done && ticketFormProgress.nextStepIndex === i;
            const openHere = formSectionOpen[TICKET_FORM_SECTION_ORDER[i]];
            return (
              <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={label}>
                <div
                  className={cn(
                    "h-1.5 w-full max-w-[4rem] rounded-full transition-colors duration-200",
                    done && "bg-[var(--color-accent)]",
                    active && "bg-[var(--color-accent)]/45 ring-1 ring-[var(--color-accent)]/60",
                    !done && !active && openHere && "bg-[var(--color-surface-3)] ring-1 ring-[var(--color-text-2)]/45",
                    !done && !active && !openHere && "bg-[var(--color-surface-3)]",
                    draftStepFlashIndex === i && !reduceMotionUi && "ccmgc-draft-step-flash",
                  )}
                />
                <span className="hidden w-full truncate text-center text-[9px] text-[var(--color-text-3)] sm:block">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-[var(--color-text-2)]" aria-live="polite">
            {ticketFormProgress.nextStepIndex === null ? (
              <span className="font-medium text-[var(--color-success)]">Pasos obligatorios completados.</span>
            ) : (
              <>
                <span className="font-medium text-[var(--color-text-1)]">Siguiente:</span>{" "}
                {
                  (["Equipo con activo", "Tipología completa", "Título (min. 3 caracteres)", "Descripción (min. 8)"] as const)[
                    ticketFormProgress.nextStepIndex
                  ]
                }
              </>
            )}
          </p>
          {ticketFormProgress.nextStepIndex !== null ? (
            <button
              type="button"
              onClick={goToNextIncompleteFormStep}
              className="shrink-0 self-start rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-2)] transition-all duration-200 hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
            >
              Ir al siguiente paso
            </button>
          ) : null}
        </div>
        <details className="mt-2 rounded-md border border-[var(--color-border)]/70 bg-[var(--color-surface)]/50 px-2 py-1.5">
          <summary className="cursor-pointer list-none text-[11px] font-medium text-[var(--color-text-2)] [&::-webkit-details-marker]:hidden">
            Requisitos del borrador
          </summary>
          <ul className="mt-2 space-y-1.5 text-[11px] text-[var(--color-text-2)]">
            {[
              { ok: ticketFormProgress.checks[0], label: "Bus y activo seleccionados" },
              { ok: ticketFormProgress.checks[1], label: "Tipología completa" },
              { ok: ticketFormProgress.checks[2], label: "Título (mín. 3 caracteres)" },
              { ok: ticketFormProgress.checks[3], label: "Descripción (mín. 8 caracteres)" },
            ].map((row) => (
              <li key={row.label} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px]",
                    row.ok
                      ? "border-[var(--color-success)]/40 bg-[var(--color-success-light)] text-[var(--color-success)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-3)]/60 text-[var(--color-text-3)]",
                  )}
                  aria-hidden
                >
                  {row.ok ? <Check size={10} strokeWidth={3} /> : ""}
                </span>
                <span className={cn(!row.ok && "text-[var(--color-text-3)]")}>{row.label}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-3">
          <CollapsibleFormBlock
            title="Equipo afectado"
            stepLabel="1/4"
            subtitle={selectedBus ? `${selectedBus.id} · ${selectedBus.operator}` : "Bus y activo"}
            open={formSectionOpen.equipment}
            onToggle={() => toggleFormSection("equipment")}
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-label">Bus</span>
                <Select
                  value={form.busId}
                  onChange={(event) => setForm((prev) => ({ ...prev, busId: event.target.value, assetId: "" }))}
                >
                  {catalog.map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      {bus.id} - {bus.operator}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1">
                <span className="text-label">Activo</span>
                <Select
                  value={form.assetId}
                  onChange={(event) => setForm((prev) => ({ ...prev, assetId: event.target.value }))}
                >
                  <option value="">Selecciona un activo</option>
                  {availableAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.id} ({asset.type})
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            {form.busId ? (
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
            subtitle={form.subsubtipo ? `${form.tipo} · ${form.subtipo}` : "Tipo, subtipo e incidencia"}
            open={formSectionOpen.tipologia}
            onToggle={() => toggleFormSection("tipologia")}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-label">Tipo</span>
                <Select
                  value={form.tipo}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      tipo: event.target.value,
                      subtipo: "",
                      subsubtipo: "",
                      dominio: "",
                      nivelImpacto: "Medio",
                      origenTecnico: "",
                      observaciones: "",
                    }))
                  }
                >
                  <option value="">Selecciona tipo</option>
                  {availableTipos.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </Select>
              </label>
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
                        item.tipo === form.tipo && item.subtipo === form.subtipo && item.subsubtipo === event.target.value,
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
            </div>
            {selectedTipologia ? (
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

            <Textarea
              label="Descripción técnica"
              placeholder="Incluye síntomas, contexto y pruebas realizadas."
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="min-h-[80px]"
              wrapperClassName="mt-3"
            />

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
                ? `${stagedUploadFiles.length} imagen(es) · comentario ${form.comment.trim() ? "rellenado" : "opcional"}`
                : "Fotos y comentario inicial (opcional)"
            }
            open={formSectionOpen.attachments}
            onToggle={() => toggleFormSection("attachments")}
          >
            <div className="space-y-2">
              <span className="text-label">Fotos adjuntas</span>
              <p className="text-[12px] leading-snug text-[var(--color-text-3)]">
                Las imágenes se suben al servidor con el ticket (almacén local bajo /uploads). Hasta {TICKET_ATTACH_MAX_FILES}{" "}
                archivos — max. {Math.round(TICKET_ATTACH_MAX_BYTES / (1024 * 1024))} MB c/u.
              </p>
              <input
                ref={photoFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                aria-label="Seleccionar imágenes adjuntas"
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
                <ul className="mt-2 space-y-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)]/40 p-2">
                  {stagedUploadFiles.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${index}`}
                      className="flex items-center justify-between gap-2 text-[12px] text-[var(--color-text-1)]"
                    >
                      <span className="min-w-0 truncate font-mono" title={file.name}>
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePhotoAt(index)}
                        className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text-2)] transition-colors duration-200 hover:border-[var(--color-error)]/40 hover:text-[var(--color-error)]"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
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

      <div className="-mx-5 -mb-5 mt-2 sticky bottom-0 z-10 rounded-b-xl border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 p-4 shadow-[0_-10px_28px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        <Button variant="primary" size="lg" onClick={() => void submitCreate()} disabled={saving} className="w-full">
          {saving ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              Guardando...
            </>
          ) : (
            <>
              <UploadCloud size={16} />
              Crear ticket
            </>
          )}
        </Button>
      </div>
    </motion.article>
  );
}
