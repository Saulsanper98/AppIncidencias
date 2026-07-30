"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ClipboardPen, Loader2, RotateCcw, Zap } from "lucide-react";
import Link from "next/link";

import type { CatalogBus } from "@/components/tickets/tickets-module-types";
import { ManageSectionCard } from "@/components/tickets/ManageSectionCard";
import { TipologiaPickerSection, applyGenericTipologiaToForm } from "@/components/tickets/TipologiaPickerSection";
import { HeroShell } from "@/components/ui/hero-shell";
import { Button } from "@/components/ui/button";
import { DateTimePickerField, defaultDatetimeLocalValue } from "@/components/ui/datetime-picker-field";
import { Input } from "@/components/ui/input";
import { KpiPill } from "@/components/ui/kpi-pill";
import { ModalShell } from "@/components/ui/modal-shell";
import { TypeaheadInput } from "@/components/ui/typeahead-input";
import { VoiceInputButton } from "@/components/ui/VoiceInputButton";
import { FalloOrigenPicker, PriorityPicker } from "@/components/tickets/PriorityOriginPickers";
import {
  collectOperatorPrefixes,
  formatPrefixHint,
} from "@/lib/catalog-id-format";
import type { SessionUser, TicketPriority } from "@/lib/domain";
import type { FalloOrigen } from "@/lib/fallo-origen";
import { GENERIC_TIPO, type TipologiaItem } from "@/lib/tipologia";
import { resolveBusIdForForm } from "@/lib/ticket-bus-asset";
import { cn } from "@/lib/utils";

type Props = {
  catalog: CatalogBus[];
  tipologias: TipologiaItem[];
  sessionUser: SessionUser | null;
  draftCount?: number;
  onCreated?: () => void;
  /** Sin hero propio cuando va embebido en Gestión. */
  embedded?: boolean;
};

type ChainState = {
  ticketId: string;
  busId: string;
  mode: "borrador" | "resuelto";
};

type ExpressActionBtnProps = {
  variant: "primary" | "draft" | "clear";
  label: string;
  hint?: string;
  icon: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
};

function ExpressActionBtn({ variant, label, hint, icon, disabled, loading, onClick }: ExpressActionBtnProps) {
  const isClear = variant === "clear";
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "express-action-btn",
        variant === "primary" && "express-action-btn--primary",
        variant === "draft" && "express-action-btn--draft",
        variant === "clear" && "express-action-btn--clear",
      )}
    >
      <span className={cn(!isClear && "express-action-btn__icon")} aria-hidden>
        {loading ? <Loader2 size={isClear ? 14 : 18} className="animate-spin" /> : icon}
      </span>
      {isClear ? (
        <span className="express-action-btn__clear-label">{label}</span>
      ) : (
        <span className="express-action-btn__body">
          <span className="express-action-btn__label">{label}</span>
          {hint ? <span className="express-action-btn__hint">{hint}</span> : null}
        </span>
      )}
    </button>
  );
}

export function ExpressTicketPanel({ catalog, tipologias, sessionUser, draftCount = 0, onCreated, embedded = false }: Props) {
  const busRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const [busId, setBusId] = useState("");
  const [note, setNote] = useState("");
  const [incidentAt, setIncidentAt] = useState(defaultDatetimeLocalValue);
  const [tipologiaTipo, setTipologiaTipo] = useState("");
  const [tipologiaSubtipo, setTipologiaSubtipo] = useState("");
  const [tipologiaSubsubtipo, setTipologiaSubsubtipo] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("media");
  const [falloOrigen, setFalloOrigen] = useState<FalloOrigen>("maquina");
  const [saving, setSaving] = useState(false);
  const [savingMode, setSavingMode] = useState<"borrador" | "resuelto" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainState | null>(null);

  const catalogPrefixes = useMemo(() => collectOperatorPrefixes(catalog.map((b) => b.id)), [catalog]);
  const busOptions = useMemo(
    () => catalog.map((bus) => ({ value: bus.id, hint: bus.operator })),
    [catalog],
  );
  const busValidation = useMemo(
    () => resolveBusIdForForm(busId.trim(), catalog.map((b) => b.id), catalogPrefixes),
    [busId, catalog, catalogPrefixes],
  );
  const availableTipos = useMemo(() => {
    const tipos = Array.from(new Set(tipologias.map((item) => item.tipo)));
    const generic = tipos.find((t) => t === GENERIC_TIPO);
    const rest = tipos.filter((t) => t !== GENERIC_TIPO).sort((a, b) => a.localeCompare(b, "es"));
    return generic ? [...rest, generic] : rest;
  }, [tipologias]);
  const availableSubtipos = useMemo(
    () =>
      Array.from(new Set(tipologias.filter((item) => item.tipo === tipologiaTipo).map((item) => item.subtipo))).sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [tipologias, tipologiaTipo],
  );
  const selectedTipologia = useMemo(
    () =>
      tipologias.find(
        (item) =>
          item.tipo === tipologiaTipo &&
          item.subtipo === tipologiaSubtipo &&
          item.subsubtipo === tipologiaSubsubtipo,
      ) ?? null,
    [tipologias, tipologiaTipo, tipologiaSubtipo, tipologiaSubsubtipo],
  );
  const isGenericTipo = tipologiaTipo === GENERIC_TIPO;

  const resetTipologia = useCallback(() => {
    setTipologiaTipo("");
    setTipologiaSubtipo("");
    setTipologiaSubsubtipo("");
  }, []);

  const applyTipologiaSelection = useCallback((item: TipologiaItem) => {
    setTipologiaTipo(item.tipo);
    setTipologiaSubtipo(item.subtipo);
    setTipologiaSubsubtipo(item.subsubtipo);
    setPriority(item.nivelImpacto === "Alto" ? "alta" : item.nivelImpacto === "Bajo" ? "baja" : "media");
  }, []);

  const resetForm = useCallback((focusBus = true) => {
    setBusId("");
    setNote("");
    setIncidentAt(defaultDatetimeLocalValue());
    resetTipologia();
    setError(null);
    if (focusBus) {
      window.requestAnimationFrame(() => busRef.current?.focus());
    }
  }, [resetTipologia]);

  useEffect(() => {
    busRef.current?.focus();
  }, []);

  const submit = async (mode: "borrador" | "resuelto") => {
    if (!sessionUser) {
      setError("Debes iniciar sesión.");
      return;
    }
    if (!busValidation.ok) {
      setError(busValidation.message);
      busRef.current?.focus();
      return;
    }
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      setError("Escribe un apunte breve.");
      noteRef.current?.focus();
      return;
    }
    if (!incidentAt.trim()) {
      setError("Indica la hora de la incidencia.");
      return;
    }

    setSaving(true);
    setSavingMode(mode);
    setError(null);
    try {
      const res = await fetch("/api/tickets/express", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busId: busValidation.normalized,
          note: trimmedNote,
          incidentOccurredAt: new Date(incidentAt).toISOString(),
          mode,
          priority,
          falloOrigen,
          ...(selectedTipologia
            ? {
                tipologia: {
                  tipo: selectedTipologia.tipo,
                  subtipo: selectedTipologia.subtipo,
                  subsubtipo: selectedTipologia.subsubtipo,
                  dominio: selectedTipologia.dominio,
                  nivelImpacto: selectedTipologia.nivelImpacto,
                  origenTecnico: selectedTipologia.origenTecnico,
                  observaciones: selectedTipologia.observaciones,
                },
              }
            : {}),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { message?: string; ticket?: { id: string } };
      if (!res.ok) {
        setError(payload.message ?? "No se pudo registrar el apunte.");
        return;
      }

      onCreated?.();
      window.dispatchEvent(new Event("ccmgc-ticket-drafts-changed"));
      setChain({
        ticketId: payload.ticket?.id ?? "",
        busId: busValidation.normalized,
        mode,
      });
      resetForm(false);
    } catch {
      setError("Error de red al registrar el apunte.");
    } finally {
      setSaving(false);
      setSavingMode(null);
    }
  };

  const canSubmit = sessionUser && busValidation.ok && note.trim().length > 0 && !saving;

  const expressForm = (
    <>
      {!sessionUser ? (
        <p className="mb-3 rounded-lg border border-[var(--color-warning)]/35 bg-[var(--color-warning-light)] px-3 py-2 text-sm text-[var(--color-text-2)]">
          Inicia sesión para registrar apuntes express durante la llamada.
        </p>
      ) : null}
      {catalog.length === 0 ? (
        <div className="mb-4 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-3 py-3">
          <p className="text-sm font-medium text-[var(--color-text-2)]">Sin catálogo disponible en este momento</p>
          <p className="mt-1 text-xs text-[var(--color-text-3)]">
            Si estás en ruta y no ves buses, anota el ID por teléfono y deja un borrador en bandeja para completarlo en cuanto recupere conexión.
          </p>
          <Link
            href="/bandeja?status=borrador"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-accent)] hover:underline"
          >
            Ir a bandeja de borradores
          </Link>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <label htmlFor="express-bus" className="text-label">
            Bus <span className="text-[var(--color-error)]">*</span>
          </label>
          <TypeaheadInput
            ref={busRef}
            id="express-bus"
            value={busId}
            onValueChange={setBusId}
            options={busOptions}
            placeholder="Ej. TIL-1234"
            autoComplete="off"
            aria-invalid={busId.trim() !== "" && !busValidation.ok}
            onKeyDown={(e) => {
              if (e.key === "Enter" && busValidation.ok) {
                e.preventDefault();
                noteRef.current?.focus();
              }
            }}
          />
          {busId.trim() && !busValidation.ok ? (
            <p className="text-[11px] text-[var(--color-error)]">{busValidation.message}</p>
          ) : (
            <p className="text-[11px] text-[var(--color-text-3)]">Prefijo operadora ({formatPrefixHint(catalogPrefixes)})</p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <label htmlFor="express-incident-at" className="text-label">
            Hora de la incidencia <span className="text-[var(--color-error)]">*</span>
          </label>
          <DateTimePickerField
            id="express-incident-at"
            value={incidentAt}
            onChange={setIncidentAt}
            ariaLabel="Hora de la incidencia"
          />
          <p className="text-[11px] text-[var(--color-text-3)]">Puede ser distinta a la hora de registro.</p>
        </div>

        <div className="sm:col-span-2">
          <p className="mb-2 text-label">
            Incidencia{" "}
            <span className="text-[10px] font-normal normal-case tracking-normal text-[var(--color-text-3)]">
              (opcional)
            </span>
          </p>
          <TipologiaPickerSection
            tipologias={tipologias}
            isGenericTipo={isGenericTipo}
            tipo={tipologiaTipo}
            subtipo={tipologiaSubtipo}
            availableTipos={availableTipos}
            availableSubtipos={availableSubtipos}
            selectedTipologia={selectedTipologia}
            onSelect={applyTipologiaSelection}
            onSearchStart={resetTipologia}
            onTipoChange={(nextTipo) => {
              setTipologiaTipo(nextTipo);
              setTipologiaSubtipo("");
              setTipologiaSubsubtipo("");
            }}
            onSubtipoChange={(nextSubtipo) => {
              setTipologiaSubtipo(nextSubtipo);
              setTipologiaSubsubtipo("");
            }}
            onGenericTipoSelect={() => {
              const generic = applyGenericTipologiaToForm();
              setTipologiaTipo(generic.tipo);
              setTipologiaSubtipo(generic.subtipo);
              setTipologiaSubsubtipo(generic.subsubtipo);
            }}
            showGuide={false}
          />
        </div>

        <div className="grid gap-5 sm:col-span-2 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-3">
          <div className="block space-y-1.5">
            <span className="text-label">Prioridad</span>
            <PriorityPicker value={priority} onChange={setPriority} aria-label="Prioridad" />
          </div>
          <div className="block space-y-1.5 sm:border-l sm:border-[var(--color-border)] sm:pl-8">
            <span className="text-label">Origen del fallo</span>
            <FalloOrigenPicker
              value={falloOrigen}
              onChange={setFalloOrigen}
              aria-label="Origen del fallo"
              compact
            />
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="express-note" className="text-label">
            Apunte <span className="text-[var(--color-error)]">*</span>
          </label>
          <div className="flex gap-2">
            <Input
              ref={noteRef}
              id="express-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. Validadora sin lectura en parada X"
              className="h-10 flex-1"
              maxLength={4000}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) {
                  e.preventDefault();
                  void submit("resuelto");
                }
              }}
            />
            <VoiceInputButton
              onTranscript={(text) => setNote((prev) => `${prev} ${text}`.trim())}
              className="shrink-0"
              size="md"
            />
          </div>
        </div>
      </div>

      <div className="express-action-bar">
        <div className="express-action-bar__group">
          <ExpressActionBtn
            variant="primary"
            label="Crear y cerrar"
            hint="Registro al instante · datos pendientes"
            icon={<Zap size={18} strokeWidth={2.2} />}
            disabled={!canSubmit}
            loading={saving && savingMode === "resuelto"}
            onClick={() => void submit("resuelto")}
          />
          <ExpressActionBtn
            variant="draft"
            label="Guardar borrador"
            hint={selectedTipologia ? "Completar adjuntos después" : "Completar tipología después"}
            icon={<ClipboardPen size={17} strokeWidth={2} />}
            disabled={!canSubmit}
            loading={saving && savingMode === "borrador"}
            onClick={() => void submit("borrador")}
          />
        </div>
        <ExpressActionBtn
          variant="clear"
          label="Limpiar"
          icon={<RotateCcw size={15} strokeWidth={2} />}
          disabled={saving}
          onClick={() => resetForm()}
        />
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      {embedded ? null : (
      <HeroShell
        eyebrow="Tickets · en llamada"
        title="Apunte express"
        subtitle="Registra lo mínimo en segundos: bus, hora real, incidencia opcional y una línea de texto. Cierra al instante o deja un borrador para completar después."
        actions={
          <Link
            href="/bandeja?status=borrador"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
              draftCount > 0
                ? "border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)]",
            )}
          >
            <ClipboardPen size={14} aria-hidden />
            {draftCount > 0
              ? `${draftCount} borrador${draftCount === 1 ? "" : "es"} en bandeja`
              : "Abrir bandeja de borradores"}
          </Link>
        }
        kpis={<KpiPill label="Campos mínimos" value={3} tone="neutral" compact />}
      />
      )}

      {embedded ? (
        <ManageSectionCard
          icon={<Zap size={15} strokeWidth={1.7} />}
          title="Apunte express"
          subtitle="Bus, hora, incidencia (opcional) y una línea de texto. Cierra al instante o deja borrador."
          actions={
            draftCount > 0 ? (
              <Link href="/bandeja?status=borrador" className="manage-section-card__header-btn">
                <ClipboardPen size={13} aria-hidden />
                {draftCount} borrador{draftCount === 1 ? "" : "es"}
              </Link>
            ) : null
          }
        >
          {expressForm}
        </ManageSectionCard>
      ) : (
        <section className="manage-section-card">
          <div className="manage-section-card__body !border-t-0">{expressForm}</div>
        </section>
      )}

      <ModalShell
        open={Boolean(chain)}
        onClose={() => {
          setChain(null);
          busRef.current?.focus();
        }}
        title={chain?.mode === "resuelto" ? "Ticket registrado" : "Borrador guardado"}
        maxWidth="24rem"
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setChain(null);
                busRef.current?.focus();
              }}
            >
              Cerrar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setChain(null);
                resetForm(true);
              }}
              className="gap-1.5"
            >
              <Zap size={14} aria-hidden />
              Siguiente ticket
            </Button>
          </div>
        }
      >
        {chain ? (
          <div className="space-y-3 text-sm text-[var(--color-text-2)]">
            <p className="flex items-start gap-2">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--color-success)]" aria-hidden />
              <span>
                {chain.mode === "resuelto"
                  ? `Incidencia de ${chain.busId} registrada. Completa tipología y adjuntos cuando puedas.`
                  : `Apunte de ${chain.busId} guardado como borrador.`}
              </span>
            </p>
            {chain.ticketId ? (
              <Link
                href={`/tickets/${chain.ticketId}`}
                className="inline-flex text-xs font-semibold text-[var(--color-accent)] hover:underline"
              >
                Ver ticket #{chain.ticketId.slice(-8).toUpperCase()}
              </Link>
            ) : null}
            <p className={cn("text-xs text-[var(--color-text-3)]")}>
              Pulsa «Siguiente ticket» para seguir encadenando apuntes sin salir de esta pantalla.
            </p>
          </div>
        ) : null}
      </ModalShell>
    </div>
  );
}
