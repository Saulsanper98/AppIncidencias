"use client";

import {
  AlertCircle,
  CalendarClock,
  Check,
  Infinity as InfinityIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { toast } from "@/components/toast-host";
import { Input, Select, Textarea } from "@/components/ui/input";
import { canaryParts, dateInCanary } from "@/lib/datetime/canary";
import type {
  DesvioDetalle,
  DesvioSentido,
  ParadaDesvio,
} from "@/lib/desvios/types";
import { cn } from "@/lib/utils";

export type DesvioFormMode = "create" | "edit";

type Props = {
  mode: DesvioFormMode;
  initial?: DesvioDetalle;
  onCancelHref?: string;
  /** Tras guardar, redirigir a esa ruta (default: detalle del desvio creado/editado). */
  onSavedHref?: (id: string) => string;
};

type FormState = {
  via: string;
  tramo: string;
  motivo: string;
  fecha_inicio: string;
  hora_inicio: string;
  fecha_fin: string;
  hora_fin: string;
  hora_fin_estimada: boolean;
  sin_fecha_fin: boolean;
  sentido: DesvioSentido;
  lineas: string[];
  paradas_fuera: ParadaDesvio[];
  paradas_alternativas: ParadaDesvio[];
  notas: string;
  url_itinerario: string;
};

const EMPTY_FORM: FormState = {
  via: "",
  tramo: "",
  motivo: "",
  fecha_inicio: "",
  hora_inicio: "08:00",
  fecha_fin: "",
  hora_fin: "20:00",
  hora_fin_estimada: false,
  sin_fecha_fin: false,
  sentido: "AMBOS",
  lineas: [],
  paradas_fuera: [],
  paradas_alternativas: [],
  notas: "",
  url_itinerario: "",
};

function buildInitialState(initial?: DesvioDetalle): FormState {
  if (!initial) return { ...EMPTY_FORM };
  const di = new Date(initial.fecha_inicio);
  const df = new Date(initial.fecha_fin);
  return {
    via: initial.via,
    tramo: initial.tramo,
    motivo: initial.motivo,
    fecha_inicio: toDateInput(di),
    hora_inicio: toTimeInput(di),
    fecha_fin: toDateInput(df),
    hora_fin: toTimeInput(df),
    hora_fin_estimada: initial.hora_fin_estimada,
    sin_fecha_fin: initial.sin_fecha_fin,
    sentido: initial.sentido,
    lineas: initial.lineas_afectadas,
    paradas_fuera: initial.paradas_fuera,
    paradas_alternativas: initial.paradas_alternativas,
    notas: initial.notas ?? "",
    url_itinerario: initial.url_itinerario ?? "",
  };
}

export function DesvioForm({ mode, initial, onCancelHref, onSavedHref }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => buildInitialState(initial));
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    setForm(buildInitialState(initial));
  }, [initial]);

  const isEdit = mode === "edit";
  const titulo = isEdit ? "Editar desvio" : "Nuevo desvio";

  const lineaTagsId = useMemo(() => `lineas-${Math.random().toString(36).slice(2, 8)}`, []);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (form.via.trim().length < 2) errors.via = "Indica la via (carretera o avenida).";
    if (form.tramo.trim().length < 2) errors.tramo = "Indica el tramo afectado.";
    if (form.motivo.trim().length < 2) errors.motivo = "Indica el motivo del cierre.";
    if (!form.fecha_inicio) errors.fecha_inicio = "Fecha de inicio obligatoria.";
    if (!form.sin_fecha_fin) {
      if (!form.fecha_fin) errors.fecha_fin = "Fecha de fin obligatoria.";
      if (form.fecha_inicio && form.fecha_fin) {
        const inicio = combine(form.fecha_inicio, form.hora_inicio);
        const fin = combine(form.fecha_fin, form.hora_fin);
        if (fin <= inicio) errors.fecha_fin = "Debe ser posterior al inicio.";
      }
    }
    if (form.lineas.length === 0) errors.lineas = "Indica al menos una linea afectada.";
    if (form.url_itinerario && !/^https?:\/\//i.test(form.url_itinerario.trim())) {
      errors.url_itinerario = "Debe empezar por http o https.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async () => {
    setGlobalError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const inicio = combine(form.fecha_inicio, form.hora_inicio);
      // Cuando el operador marca "Sin fecha de fin", la fecha_fin no tiene
      // significado operativo. La almacenamos igual a la de inicio para no
      // romper la columna NOT NULL y para que el cronograma del detalle no
      // muestre un "intervalo invertido" si alguien desactiva el flag mas
      // tarde. La UI seguira pintando "Hasta desactivar" mientras el flag
      // este activo.
      const fin = form.sin_fecha_fin
        ? inicio
        : combine(form.fecha_fin, form.hora_fin);
      const payload = {
        via: form.via.trim(),
        tramo: form.tramo.trim(),
        motivo: form.motivo.trim(),
        fecha_inicio: inicio.toISOString(),
        fecha_fin: fin.toISOString(),
        hora_fin_estimada: form.sin_fecha_fin ? false : form.hora_fin_estimada,
        sin_fecha_fin: form.sin_fecha_fin,
        sentido: form.sentido,
        lineas_afectadas: form.lineas,
        paradas_fuera: form.paradas_fuera,
        paradas_alternativas: form.paradas_alternativas,
        notas: form.notas.trim() || null,
        url_itinerario: form.url_itinerario.trim() || null,
      };
      const url = isEdit && initial ? `/api/desvios/${initial.id}` : "/api/desvios";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; errors?: Record<string, string[]> };
        if (data.errors) {
          const collected: Record<string, string> = {};
          for (const [k, v] of Object.entries(data.errors)) {
            if (Array.isArray(v) && v[0]) collected[k] = v[0];
          }
          setFieldErrors(collected);
        }
        throw new Error(data.message ?? "No se pudo guardar el desvio");
      }
      const data = (await res.json()) as { desvio: DesvioDetalle };
      toast.success(isEdit ? "Desvio actualizado" : "Desvio creado");
      const href = onSavedHref ? onSavedHref(data.desvio.id) : `/desvios/${data.desvio.id}`;
      router.push(href);
      router.refresh();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--color-text-1)]">
            {titulo}
          </h1>
          <p className="text-xs text-[var(--color-text-3)]">
            {isEdit
              ? "Solo se pueden editar campos de un desvio en estado PENDIENTE."
              : "Crea un desvio manual cuando la informacion no llegue por correo."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onCancelHref ? (
            <button
              type="button"
              onClick={() => router.push(onCancelHref)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-xs font-medium text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
            >
              <X size={13} /> Cancelar
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 text-xs font-semibold text-white shadow-md shadow-[var(--color-accent)]/20 transition-all hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {isEdit ? "Guardar cambios" : "Crear desvio"}
          </button>
        </div>
      </header>

      {globalError ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
          <AlertCircle size={14} className="shrink-0" />
          {globalError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Localizacion">
          <Field label="Via" error={fieldErrors.via} required>
            <Input
              value={form.via}
              onChange={(e) => setForm((p) => ({ ...p, via: e.target.value }))}
              placeholder="Ej. GC-5"
            />
          </Field>
          <Field label="Tramo" error={fieldErrors.tramo} required>
            <Input
              value={form.tramo}
              onChange={(e) => setForm((p) => ({ ...p, tramo: e.target.value }))}
              placeholder="Glorieta del Batan-Rafael Cabrera"
            />
          </Field>
          <Field label="Motivo" error={fieldErrors.motivo} required>
            <Input
              value={form.motivo}
              onChange={(e) => setForm((p) => ({ ...p, motivo: e.target.value }))}
              placeholder="Asfaltado / Prueba ciclista / Manifestacion…"
            />
          </Field>
          <Field label="Sentido afectado">
            <Select
              value={form.sentido}
              onValueChange={(v) => setForm((p) => ({ ...p, sentido: v as DesvioSentido }))}
            >
              <option value="IDA">Ida</option>
              <option value="VUELTA">Vuelta</option>
              <option value="AMBOS">Ambos</option>
            </Select>
          </Field>
        </Section>

        <Section title="Horario">
          {/* Selector tipo "segmento" para elegir el tipo de desvio: programado
              (con fecha y hora de fin) o indefinido (se activa/desactiva a mano).
              Sustituye a un checkbox plano para hacer la decision mas obvia y
              dejar claro que las dos opciones son mutuamente excluyentes. */}
          <TipoSelector
            value={form.sin_fecha_fin ? "indefinido" : "programado"}
            onChange={(v) =>
              setForm((p) => ({
                ...p,
                sin_fecha_fin: v === "indefinido",
                // Si pasamos a indefinido, desmarcamos "hora estimada" por
                // coherencia (ya no tiene sentido).
                hora_fin_estimada: v === "indefinido" ? false : p.hora_fin_estimada,
              }))
            }
          />

          <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:grid-cols-2">
            <Field label="Fecha inicio" error={fieldErrors.fecha_inicio} required>
              <Input
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => setForm((p) => ({ ...p, fecha_inicio: e.target.value }))}
              />
            </Field>
            <Field label="Hora inicio">
              <Input
                type="time"
                value={form.hora_inicio}
                onChange={(e) => setForm((p) => ({ ...p, hora_inicio: e.target.value }))}
              />
            </Field>

            {form.sin_fecha_fin ? (
              <div className="col-span-2 rounded-lg border border-dashed border-[var(--color-accent)]/40 bg-gradient-to-br from-[var(--color-accent-light)]/55 to-transparent p-3">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--color-text-1)]">
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                    aria-hidden
                  >
                    <InfinityIcon size={12} strokeWidth={2.2} />
                  </span>
                  Este desvío no tiene fecha de fin
                </p>
                <p className="mt-1.5 pl-7 text-[11.5px] leading-relaxed text-[var(--color-text-3)]">
                  Quedará vivo hasta que un operador pulse{" "}
                  <strong className="text-[var(--color-text-2)]">Desactivar</strong>{" "}
                  desde la vista de detalle. Ideal para cortes que se repiten
                  por franjas horarias o eventos sin hora de reapertura clara.
                </p>
              </div>
            ) : (
              <>
                <Field label="Fecha fin" error={fieldErrors.fecha_fin} required>
                  <Input
                    type="date"
                    value={form.fecha_fin}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, fecha_fin: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Hora fin">
                  <Input
                    type="time"
                    value={form.hora_fin}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, hora_fin: e.target.value }))
                    }
                  />
                </Field>
              </>
            )}
          </div>

          {!form.sin_fecha_fin ? (
            <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] text-[var(--color-text-2)]">
              <input
                type="checkbox"
                checked={form.hora_fin_estimada}
                onChange={(e) =>
                  setForm((p) => ({ ...p, hora_fin_estimada: e.target.checked }))
                }
                className="h-3.5 w-3.5 rounded border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-accent)]"
              />
              Hora de fin estimada (&quot;previsiblemente&quot;).
            </label>
          ) : null}
          <Field label="URL del itinerario alternativo" error={fieldErrors.url_itinerario}>
            <Input
              value={form.url_itinerario}
              onChange={(e) => setForm((p) => ({ ...p, url_itinerario: e.target.value }))}
              placeholder="https://…"
            />
          </Field>
        </Section>

        <Section title="Lineas afectadas" full>
          <Field
            label="Líneas"
            help="Pulsa Enter o coma para añadir cada línea (ej. 19, 36, 80)."
            error={fieldErrors.lineas}
            required
          >
            <TagsInput
              id={lineaTagsId}
              values={form.lineas}
              onChange={(values) => setForm((p) => ({ ...p, lineas: values }))}
              placeholder="Añadir línea…"
            />
          </Field>
        </Section>

        <Section title="Paradas fuera de servicio" full>
          <ParadasEditor
            paradas={form.paradas_fuera}
            onChange={(value) => setForm((p) => ({ ...p, paradas_fuera: value }))}
            emptyHint="Sin paradas fuera de servicio."
          />
        </Section>

        <Section title="Paradas alternativas" full>
          <ParadasEditor
            paradas={form.paradas_alternativas}
            onChange={(value) => setForm((p) => ({ ...p, paradas_alternativas: value }))}
            emptyHint="Sin paradas alternativas."
          />
        </Section>

        <Section title="Notas internas" full>
          <Textarea
            value={form.notas}
            onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
            placeholder="Aclaraciones para los compañeros del centro de control…"
            rows={3}
            maxLength={2000}
          />
        </Section>
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function Section({
  title,
  children,
  full,
}: {
  title: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <section
      className={cn(
        "space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm",
        full ? "lg:col-span-2" : undefined,
      )}
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-3)]">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  help,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-label flex items-center gap-1 text-[var(--color-text-2)]">
        {label}
        {required ? <span className="text-[var(--color-error)]">*</span> : null}
      </label>
      {children}
      {help ? <p className="text-[11px] text-[var(--color-text-3)]">{help}</p> : null}
      {error ? (
        <p className="flex items-center gap-1 text-[11px] text-[var(--color-error)]">
          <AlertCircle size={11} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Selector segmentado para elegir el tipo de horario del desvio. Las dos
 * opciones se pintan como tarjetas con icono + descripcion; la activa queda
 * resaltada con el color de acento. El operador entiende mas rapido que esto
 * es una decision binaria que con un checkbox suelto.
 */
function TipoSelector({
  value,
  onChange,
}: {
  value: "programado" | "indefinido";
  onChange: (v: "programado" | "indefinido") => void;
}) {
  const options: Array<{
    id: "programado" | "indefinido";
    icon: typeof CalendarClock;
    title: string;
    desc: string;
  }> = [
    {
      id: "programado",
      icon: CalendarClock,
      title: "Programado",
      desc: "Con fecha y hora de fin definidas",
    },
    {
      id: "indefinido",
      icon: InfinityIcon,
      title: "Sin fecha de fin",
      desc: "Se activa y desactiva manualmente",
    },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de horario del desvio"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              "group relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
              active
                ? "border-[var(--color-accent)]/55 bg-gradient-to-br from-[var(--color-accent-light)]/85 via-[var(--color-accent-light)]/40 to-transparent shadow-sm"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)]/55 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-2)]",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-[var(--color-accent)] text-white shadow-md shadow-[var(--color-accent)]/30"
                  : "bg-[var(--color-surface-3)] text-[var(--color-text-3)] group-hover:text-[var(--color-text-2)]",
              )}
              aria-hidden
            >
              <Icon size={14} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-[13px] font-semibold leading-tight",
                  active ? "text-[var(--color-text-1)]" : "text-[var(--color-text-2)]",
                )}
              >
                {opt.title}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-text-3)]">
                {opt.desc}
              </p>
            </div>
            {active ? (
              <span
                className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-sm"
                aria-hidden
              >
                <Check size={10} strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function TagsInput({
  id,
  values,
  onChange,
  placeholder,
}: {
  id: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const commit = (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    if (values.includes(next)) return;
    onChange([...values, next]);
    setDraft("");
  };
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent-light)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--color-accent)]"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-[var(--color-accent)] transition-opacity hover:opacity-70"
            aria-label={`Quitar ${v}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        placeholder={placeholder}
        className="min-w-[6rem] flex-1 bg-transparent px-1 py-1 text-sm text-[var(--color-text-1)] outline-none placeholder:text-[var(--color-text-3)]"
      />
    </div>
  );
}

function ParadasEditor({
  paradas,
  onChange,
  emptyHint,
}: {
  paradas: ParadaDesvio[];
  onChange: (next: ParadaDesvio[]) => void;
  emptyHint: string;
}) {
  const update = (idx: number, patch: Partial<ParadaDesvio>) => {
    const next = [...paradas];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => onChange(paradas.filter((_, i) => i !== idx));
  const add = () => onChange([...paradas, { nombre: "", codigo: "" }]);

  return (
    <div className="space-y-2">
      {paradas.length === 0 ? (
        <p className="text-[11.5px] text-[var(--color-text-3)]">{emptyHint}</p>
      ) : (
        <ul className="space-y-2">
          {paradas.map((p, idx) => (
            // En movil apilamos: nombre + (codigo y boton borrar al lado),
            // asi cada parada ocupa solo 2 filas en lugar de scrollear
            // horizontalmente cuando el campo "Nombre" es largo.
            <li
              key={idx}
              className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-surface-2)]/40 p-2 sm:grid sm:grid-cols-12 sm:items-center sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0"
            >
              <div className="sm:col-span-7">
                <Input
                  value={p.nombre}
                  placeholder="Nombre"
                  onChange={(e) => update(idx, { nombre: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-5">
                <div className="flex-1 sm:max-w-none">
                  <Input
                    value={p.codigo}
                    placeholder="Codigo"
                    onChange={(e) => update(idx, { codigo: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--color-text-3)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-error)] sm:h-8 sm:w-8"
                  aria-label="Eliminar parada"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border-hover)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
      >
        <Plus size={11} />
        Añadir parada
      </button>
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────

// Los <input type="date"> y <input type="time"> trabajan con strings naive
// (sin TZ). Tanto al pintar (toDateInput/toTimeInput) como al recombinar
// (combine), tratamos esos strings como HORA CANARIA literal: el operador
// nunca tiene que pensar en zonas horarias. El navegador puede estar en otra
// TZ; usando canaryParts/dateInCanary garantizamos que "22:00" mostrado y
// guardado en el form se almacene como las 22:00 de Atlantic/Canary y vuelva
// a salir como "22:00" tras un round-trip por el servidor.

function toDateInput(d: Date): string {
  const p = canaryParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function toTimeInput(d: Date): string {
  const p = canaryParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function combine(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return dateInCanary(y, m ?? 1, d ?? 1, hh ?? 0, mm ?? 0);
}
