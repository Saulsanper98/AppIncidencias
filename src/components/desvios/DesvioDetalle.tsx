"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  CircleSlash,
  Clock,
  ExternalLink,
  FileText,
  Hourglass,
  Infinity as InfinityIcon,
  Loader2,
  MapPin,
  Pencil,
  Power,
  Route as RouteIcon,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { DesvioForm } from "@/components/desvios/DesvioForm";
import { EstadoBadge } from "@/components/desvios/EstadoBadge";
import { OrigenBadge } from "@/components/desvios/OrigenBadge";
import { toast } from "@/components/toast-host";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { canaryParts } from "@/lib/datetime/canary";
import type {
  DesvioDetalle as DesvioDetalleType,
  DesvioEstado,
} from "@/lib/desvios/types";
import { cn } from "@/lib/utils";

/**
 * Color de acento por estado del desvio. Se usa en la barra lateral del Hero
 * y en la barra de progreso del Cronograma. Mantengo los mismos hex que
 * EstadoBadge para que la lectura visual sea coherente.
 */
const ESTADO_ACCENT: Record<DesvioEstado, { bar: string; track: string; fill: string }> = {
  PENDIENTE: {
    bar: "bg-[#d97706]",
    track: "bg-[rgba(217,119,6,0.14)]",
    fill: "bg-[#d97706]",
  },
  ACTIVO: {
    bar: "bg-[#dc2626]",
    track: "bg-[rgba(220,38,38,0.14)]",
    fill: "bg-[#dc2626]",
  },
  RESUELTO: {
    bar: "bg-[#059669]",
    track: "bg-[rgba(5,150,105,0.14)]",
    fill: "bg-[#059669]",
  },
  CANCELADO: {
    bar: "bg-[var(--color-text-3)]",
    track: "bg-[var(--color-surface-3)]",
    fill: "bg-[var(--color-text-3)]",
  },
};

type Props = {
  initial: DesvioDetalleType;
  canManage: boolean;
  canDelete: boolean;
};

type Action = "confirmar" | "resolver" | "cancelar" | "reactivar" | "eliminar" | null;

export function DesvioDetalle({ initial, canManage, canDelete }: Props) {
  const router = useRouter();
  const [desvio, setDesvio] = useState<DesvioDetalleType>(initial);
  const [editing, setEditing] = useState(false);
  const [running, setRunning] = useState<Action>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Si el SSE indica que este desvio cambio, refrescamos detalle.
  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");
    const onActualizado = async (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as { payload?: { id?: string } };
        if (parsed.payload?.id && parsed.payload.id === desvio.id) {
          const res = await fetch(`/api/desvios/${desvio.id}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (res.ok) {
            const data = (await res.json()) as { desvio: DesvioDetalleType };
            setDesvio(data.desvio);
          }
        }
      } catch {
        /* ignore */
      }
    };
    source.addEventListener(
      "desvio_actualizado",
      onActualizado as unknown as EventListener,
    );
    return () => {
      source.removeEventListener(
        "desvio_actualizado",
        onActualizado as unknown as EventListener,
      );
      source.close();
    };
  }, [desvio.id]);

  // Breadcrumb del layout (p7): código de línea en la miga de pan superior.
  useEffect(() => {
    const lineCode =
      desvio.lineas_afectadas.length > 0
        ? desvio.lineas_afectadas.join(", ")
        : desvio.via?.trim() || "Detalle";
    try {
      sessionStorage.setItem(
        "ccmgc_desvio_crumb",
        JSON.stringify({ id: desvio.id, title: lineCode }),
      );
      window.dispatchEvent(new Event("ccmgc-desvio-breadcrumb"));
    } catch {
      /* ignore */
    }
  }, [desvio.id, desvio.lineas_afectadas, desvio.via]);

  const transition = async (
    action: Exclude<Action, null | "eliminar">,
    successMsg: string,
  ) => {
    if (running) return;
    setRunning(action);
    try {
      const res = await fetch(`/api/desvios/${desvio.id}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo realizar la accion");
      }
      const data = (await res.json()) as { desvio: DesvioDetalleType };
      setDesvio(data.desvio);
      toast.success(successMsg);
    } catch (err) {
      toast.error("Error", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setRunning(null);
    }
  };

  const remove = async () => {
    if (running) return;
    setRunning("eliminar");
    try {
      const res = await fetch(`/api/desvios/${desvio.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo eliminar");
      }
      toast.success("Desvio eliminado");
      router.push("/desvios");
      router.refresh();
    } catch (err) {
      toast.error("Error al eliminar", { description: err instanceof Error ? err.message : undefined });
      setRunning(null);
    }
  };

  if (editing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <DesvioForm
          mode="edit"
          initial={desvio}
          onCancelHref={`/desvios/${desvio.id}`}
          onSavedHref={(id) => {
            setEditing(false);
            return `/desvios/${id}`;
          }}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-5"
    >
      <Header
        desvio={desvio}
        canManage={canManage}
        canDelete={canDelete}
        running={running}
        confirmDelete={confirmDelete}
        onEdit={() => setEditing(true)}
        onConfirmar={() => void transition("confirmar", "Desvio confirmado y activo")}
        onResolver={() => void transition("resolver", "Desvio resuelto")}
        onCancelar={() => void transition("cancelar", "Desvio cancelado")}
        onReactivar={() => void transition("reactivar", "Desvio reactivado")}
        onAskDelete={() => setConfirmDelete(true)}
        onCancelDelete={() => setConfirmDelete(false)}
        onConfirmDelete={() => void remove()}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Resumen" icon={RouteIcon}>
            <DescriptionGrid>
              <Description label="Via" value={desvio.via} />
              <Description label="Tramo" value={desvio.tramo} />
              <Description label="Motivo" value={desvio.motivo} />
              <Description
                label="Sentido afectado"
                value={<SentidoChip sentido={desvio.sentido} />}
              />
              <Description
                label="Lineas afectadas"
                value={<LineasChips lineas={desvio.lineas_afectadas} />}
              />
              <Description
                label="Hora de fin estimada"
                value={
                  desvio.sin_fecha_fin ? (
                    <span className="inline-flex items-center gap-1 text-[var(--color-accent)]">
                      <InfinityIcon size={12} strokeWidth={2} />
                      Sin fecha de fin
                    </span>
                  ) : desvio.hora_fin_estimada ? (
                    <span className="inline-flex items-center gap-1 text-[#d97706]">
                      <Hourglass size={12} strokeWidth={2} />
                      Si (previsiblemente)
                    </span>
                  ) : (
                    "No"
                  )
                }
              />
            </DescriptionGrid>
          </Card>

          <Card title="Cronograma" icon={CalendarClock}>
            <CronogramaTimeline desvio={desvio} />
          </Card>

          <ParadasCard
            title="Paradas fuera de servicio"
            paradas={desvio.paradas_fuera}
            tone="rose"
            emptyHint="No se registran paradas afectadas en esta circular."
          />

          <ParadasCard
            title="Paradas alternativas"
            paradas={desvio.paradas_alternativas}
            tone="emerald"
            emptyHint="No se proponen paradas alternativas en esta circular."
          />

          {desvio.notas ? (
            <Card title="Notas internas" icon={Pencil}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-1)]">
                {desvio.notas}
              </p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <FichaRapidaCard desvio={desvio} />
          <Card title="Linea de tiempo" icon={Clock}>
            <Timeline desvio={desvio} />
          </Card>
          <RecursosCard desvio={desvio} />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Header con botones contextuales ───────────────────────────────────────

function Header({
  desvio,
  canManage,
  canDelete,
  running,
  confirmDelete,
  onEdit,
  onConfirmar,
  onResolver,
  onCancelar,
  onReactivar,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  desvio: DesvioDetalleType;
  canManage: boolean;
  canDelete: boolean;
  running: Action;
  confirmDelete: boolean;
  onEdit: () => void;
  onConfirmar: () => void;
  onResolver: () => void;
  onCancelar: () => void;
  onReactivar: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const isPendiente = desvio.estado === "PENDIENTE";
  const isActivo = desvio.estado === "ACTIVO";
  const isResuelto = desvio.estado === "RESUELTO";
  const isIndefinido = desvio.sin_fecha_fin;
  // El "titulo" del PDF a veces trae basura tipo "PRODUCCION DPTO. PAG. 1 DE 1".
  // Si el tramo esta presente, lo preferimos como subtitulo (es lo que el
  // operador necesita ver). Solo caemos al titulo cuando no hay tramo.
  const subtitulo = desvio.tramo || desvio.titulo || "";

  return (
    <div className="space-y-3">
      {/* Breadcrumb sutil que sustituye el viejo boton "Volver" inline. */}
      <Link
        href="/desvios"
        className="group inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-1)]"
      >
        <ChevronLeft
          size={13}
          className="transition-transform group-hover:-translate-x-0.5"
        />
        Desvios
      </Link>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[var(--color-surface-2)]/45 shadow-sm">
        {/* Barra de acento lateral: cambia de color segun el estado, da una
            lectura "de un vistazo" sin necesidad de leer el badge. */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-1",
            ESTADO_ACCENT[desvio.estado].bar,
          )}
          aria-hidden
        />
        <div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:p-5 sm:pl-6">
          <div className="flex min-w-0 items-start gap-4">
            <div
              className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_25%,transparent)]"
              aria-hidden
            >
              <RouteIcon size={20} strokeWidth={1.7} />
              {/* Punto pequeno indicador de estado en la esquina del icono. */}
              <span
                className={cn(
                  "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--color-surface)]",
                  ESTADO_ACCENT[desvio.estado].bar,
                )}
              />
            </div>
            <div className="min-w-0">
              <SectionEyebrow pulse>CCMGC · Operación</SectionEyebrow>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--color-text-1)]">
                  {desvio.via || "Sin via"}
                </h1>
                <EstadoBadge estado={desvio.estado} size="md" />
                <OrigenBadge origen={desvio.origen} size="md" />
                {isIndefinido ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-[rgba(124,58,237,0.40)] bg-[rgba(124,58,237,0.10)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#7c3aed] shadow-sm"
                    title="Desvio sin fecha de fin: se desactiva manualmente"
                  >
                    <InfinityIcon size={11} strokeWidth={2.2} aria-hidden />
                    Indefinido
                  </span>
                ) : null}
              </div>
              {subtitulo ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-[var(--color-text-2)]">
                  <MapPin
                    size={13}
                    className="shrink-0 text-[var(--color-text-3)]"
                    aria-hidden
                  />
                  <span className="line-clamp-2 text-pretty">{subtitulo}</span>
                </p>
              ) : null}
              <p className="mt-1 font-mono text-[11px] text-[var(--color-text-3)]">
                {desvio.referencia}
              </p>
              <EstadoStepper estado={desvio.estado} className="mt-3" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isPendiente && canManage ? (
              <ActionBtn
                tone="success"
                icon={ShieldCheck}
                onClick={onConfirmar}
                disabled={running !== null}
                loading={running === "confirmar"}
              >
                {isIndefinido ? "Activar" : "Confirmar y activar"}
              </ActionBtn>
            ) : null}
            {isActivo && canManage ? (
              <ActionBtn
                tone="success"
                icon={CheckCircle2}
                onClick={onResolver}
                disabled={running !== null}
                loading={running === "resolver"}
              >
                {isIndefinido ? "Desactivar" : "Marcar como resuelto"}
              </ActionBtn>
            ) : null}
            {/* Reactivar solo aplica a desvios indefinidos: vuelve a ponerlo
                en ACTIVO sin tener que crear uno nuevo. Util para cortes
                recurrentes (manifestaciones semanales, mercados...). */}
            {isResuelto && isIndefinido && canManage ? (
              <ActionBtn
                tone="violet"
                icon={Power}
                onClick={onReactivar}
                disabled={running !== null}
                loading={running === "reactivar"}
              >
                Reactivar
              </ActionBtn>
            ) : null}
            {isPendiente && canManage ? (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-[12px] font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
              >
                <Pencil size={13} />
                Editar
              </button>
            ) : null}
            {(isPendiente || isActivo) && canManage ? (
              <ActionBtn
                tone="muted"
                icon={CircleSlash}
                onClick={onCancelar}
                disabled={running !== null}
                loading={running === "cancelar"}
              >
                Cancelar
              </ActionBtn>
            ) : null}
            {canDelete ? (
              <AnimatePresence mode="wait" initial={false}>
                {confirmDelete ? (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="flex items-center gap-1.5"
                  >
                    <span className="text-[11px] font-medium text-[var(--color-error)]">
                      {"\u00BF"}Eliminar?
                    </span>
                    <button
                      type="button"
                      onClick={onConfirmDelete}
                      disabled={running !== null}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-error)] px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {running === "eliminar" ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Si, eliminar
                    </button>
                    <button
                      type="button"
                      onClick={onCancelDelete}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 text-[12px] font-medium text-[var(--color-text-2)]"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="ask"
                    type="button"
                    onClick={onAskDelete}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgba(220,38,38,0.30)] bg-[rgba(220,38,38,0.06)] px-3 text-[12px] font-medium text-[var(--color-error)] hover:bg-[rgba(220,38,38,0.10)]"
                  >
                    <Trash2 size={13} />
                    Eliminar
                  </motion.button>
                )}
              </AnimatePresence>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pasos horizontales del ciclo de vida del desvío. */
function EstadoStepper({
  estado,
  className,
}: {
  estado: DesvioEstado;
  className?: string;
}) {
  const terminalLabel = estado === "CANCELADO" ? "Cancelado" : "Resuelto";
  const steps = [
    { key: "PENDIENTE", label: "Pendiente" },
    { key: "ACTIVO", label: "Activo" },
    { key: "TERMINAL", label: terminalLabel },
  ] as const;
  const activeIdx =
    estado === "PENDIENTE" ? 0 : estado === "ACTIVO" ? 1 : 2;
  const terminalDone = estado === "RESUELTO" || estado === "CANCELADO";

  return (
    <ol
      className={cn("flex flex-wrap items-center gap-1 sm:gap-0", className)}
      aria-label="Estado del desvío"
    >
      {steps.map((step, idx) => {
        const done = idx < activeIdx || (idx === 2 && terminalDone);
        const current = idx === activeIdx;
        const isCancelTerminal = idx === 2 && estado === "CANCELADO";
        return (
          <li key={step.key} className="flex items-center">
            {idx > 0 ? (
              <span
                aria-hidden
                className={cn(
                  "mx-1 hidden h-px w-4 sm:block sm:w-6",
                  done || current
                    ? isCancelTerminal && idx === 2
                      ? "bg-[var(--color-text-3)]"
                      : "bg-[var(--color-accent)]"
                    : "bg-[var(--color-border)]",
                )}
              />
            ) : null}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] transition-colors",
                current &&
                  (isCancelTerminal
                    ? "border-[var(--color-text-3)] bg-[var(--color-surface-3)] text-[var(--color-text-2)]"
                    : "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"),
                done &&
                  !current &&
                  (isCancelTerminal && estado === "CANCELADO"
                    ? "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)]"
                    : "border-[rgba(5,150,105,0.35)] bg-[rgba(5,150,105,0.10)] text-[#059669]"),
                !done &&
                  !current &&
                  "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)]",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[9px]",
                  current &&
                    (isCancelTerminal
                      ? "bg-[var(--color-text-3)] text-white"
                      : "bg-[var(--color-accent)] text-white"),
                  done &&
                    !current &&
                    (isCancelTerminal && estado === "CANCELADO"
                      ? "bg-[var(--color-surface-3)] text-[var(--color-text-3)]"
                      : "bg-[#059669] text-white"),
                  !done && !current && "bg-[var(--color-surface-3)] text-[var(--color-text-3)]",
                )}
              >
                {done && !current ? "✓" : idx + 1}
              </span>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ActionBtn({
  tone,
  icon: Icon,
  onClick,
  disabled,
  loading,
  children,
}: {
  tone: "success" | "muted" | "violet";
  icon: typeof CheckCircle2;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}) {
  const palette = (() => {
    switch (tone) {
      case "success":
        return "bg-[var(--color-success)] text-white hover:opacity-90";
      case "violet":
        // Mismo violeta que el resto del lenguaje visual de los desvios
        // indefinidos (KPI pill, chips, barra "viva"...) para que el
        // boton se lea como "vuelve a la misma fase indefinida".
        return "bg-[#7c3aed] text-white shadow-md shadow-[#7c3aed]/25 hover:bg-[#6d28d9]";
      case "muted":
      default:
        return "border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]";
    }
  })();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold shadow-sm transition-all disabled:opacity-60",
        palette,
      )}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
      {children}
    </button>
  );
}

// ─── Cards y descripciones ─────────────────────────────────────────────────

function Card({
  title,
  icon: Icon,
  accent = "accent",
  meta,
  children,
}: {
  title: string;
  icon: typeof CheckCircle2;
  /**
   * Tinte del icono y borde sutil del encabezado de la card. Permite
   * diferenciar las cards "rojas" (paradas fuera de servicio) de las "verdes"
   * (paradas alternativas) sin tener que duplicar el componente.
   */
  accent?: "accent" | "rose" | "emerald";
  /** Adorno opcional alineado a la derecha del titulo (numero, badge, etc.). */
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  const palette: Record<NonNullable<typeof accent>, string> = {
    accent: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
    rose: "bg-[rgba(220,38,38,0.10)] text-[#dc2626]",
    emerald: "bg-[rgba(5,150,105,0.10)] text-[#059669]",
  };
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-md",
            palette[accent],
          )}
          aria-hidden
        >
          <Icon size={12} strokeWidth={1.8} />
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-3)]">
          {title}
        </h2>
        {meta ? <span className="ml-auto">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function DescriptionGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Description({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-3)]">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-[var(--color-text-1)]">{value || "\u2014"}</p>
    </div>
  );
}

function ParadasCard({
  title,
  paradas,
  tone,
  emptyHint,
}: {
  title: string;
  paradas: { nombre: string; codigo: string }[];
  tone: "rose" | "emerald";
  emptyHint: string;
}) {
  const isRose = tone === "rose";
  return (
    <Card
      title={title}
      icon={MapPin}
      accent={tone}
      meta={
        paradas.length > 0 ? (
          <span
            className={cn(
              "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums",
              isRose
                ? "bg-[rgba(220,38,38,0.10)] text-[#dc2626]"
                : "bg-[rgba(5,150,105,0.10)] text-[#059669]",
            )}
          >
            {paradas.length}
          </span>
        ) : null
      }
    >
      {paradas.length === 0 ? (
        <p className="text-[12px] italic text-[var(--color-text-3)]">{emptyHint}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {paradas.map((p, idx) => (
            <li
              key={`${p.codigo}-${idx}`}
              className={cn(
                "group flex items-center justify-between gap-3 rounded-lg border bg-[var(--color-surface-2)]/55 px-3 py-2 text-sm transition-colors",
                isRose
                  ? "border-[rgba(220,38,38,0.18)] hover:border-[rgba(220,38,38,0.32)] hover:bg-[rgba(220,38,38,0.05)]"
                  : "border-[rgba(5,150,105,0.20)] hover:border-[rgba(5,150,105,0.36)] hover:bg-[rgba(5,150,105,0.05)]",
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {/* Numero de orden: facilita comunicar paradas por radio
                    ("la #2 de Fuera de servicio") sin tener que leer el
                    nombre completo. */}
                <span
                  aria-hidden
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                    isRose
                      ? "bg-[rgba(220,38,38,0.10)] text-[#dc2626]"
                      : "bg-[rgba(5,150,105,0.10)] text-[#059669]",
                  )}
                >
                  {idx + 1}
                </span>
                <span className="min-w-0 truncate text-[var(--color-text-1)]">
                  {p.nombre || "\u2014"}
                </span>
              </span>
              <span
                className={cn(
                  "inline-flex h-5 shrink-0 items-center rounded-md border px-2 font-mono text-[10.5px] font-semibold",
                  isRose
                    ? "border-[rgba(220,38,38,0.25)] bg-[rgba(220,38,38,0.10)] text-[#dc2626]"
                    : "border-[rgba(5,150,105,0.25)] bg-[rgba(5,150,105,0.10)] text-[#059669]",
                )}
              >
                {p.codigo || "\u2014"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Chip con icono direccional para el sentido afectado. */
function SentidoChip({ sentido }: { sentido: DesvioDetalleType["sentido"] }) {
  if (sentido === "AMBOS") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--color-text-1)]">
        <ArrowLeftRight size={11} strokeWidth={2} className="text-[var(--color-accent)]" />
        Ambos sentidos
      </span>
    );
  }
  if (sentido === "IDA") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--color-text-1)]">
        <ArrowRight size={11} strokeWidth={2} className="text-[var(--color-accent)]" />
        Ida
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--color-text-1)]">
      <ArrowRight
        size={11}
        strokeWidth={2}
        className="rotate-180 text-[var(--color-accent)]"
      />
      Vuelta
    </span>
  );
}

/** Chips compactos para mostrar las lineas afectadas. */
function LineasChips({ lineas }: { lineas: string[] }) {
  if (lineas.length === 0) {
    return <span className="text-[var(--color-text-3)]">{"\u2014"}</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {lineas.map((l) => (
        <span
          key={l}
          className="inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 text-[11.5px] font-semibold tabular-nums text-[var(--color-text-1)]"
        >
          {l}
        </span>
      ))}
    </div>
  );
}

function RecursosCard({ desvio }: { desvio: DesvioDetalleType }) {
  if (!desvio.pdf_path && !desvio.url_itinerario) {
    return null;
  }
  return (
    <Card title="Recursos" icon={ExternalLink}>
      <div className="flex flex-col gap-2">
        {desvio.pdf_path ? (
          <ResourceLink
            href={desvio.pdf_path}
            icon={FileText}
            label="Ver PDF original"
            hint="Documento adjunto"
          />
        ) : null}
        {desvio.url_itinerario ? (
          <ResourceLink
            href={desvio.url_itinerario}
            icon={RouteIcon}
            label="Itinerario alternativo"
            hint="Mapa / desvio sugerido"
          />
        ) : null}
      </div>
    </Card>
  );
}

function ResourceLink({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: typeof FileText;
  label: string;
  hint: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/55 p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)]/55 hover:shadow-sm"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent-light)] text-[var(--color-accent)]">
        <Icon size={14} strokeWidth={1.8} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[12.5px] font-semibold text-[var(--color-text-1)]">
          {label}
        </span>
        <span className="block truncate text-[10.5px] text-[var(--color-text-3)]">
          {hint}
        </span>
      </span>
      <ExternalLink
        size={12}
        className="shrink-0 text-[var(--color-text-3)] transition-colors group-hover:text-[var(--color-accent)]"
        aria-hidden
      />
    </a>
  );
}

/**
 * Cronograma visual: muestra el intervalo del corte como una "barra
 * temporal" con dos marcadores (inicio y fin), una barra de progreso si el
 * desvio esta en curso, y un texto contextual ("Comienza en X h", "Quedan Y
 * min", "Duro Z h") segun el estado. Sustituye a la ficha "Horario" plana
 * con etiquetas Inicio/Fin/Duracion porque esa informacion ya estaba en la
 * Vista rapida del lateral; aqui anadimos contexto temporal real.
 */
function CronogramaTimeline({ desvio }: { desvio: DesvioDetalleType }) {
  const inicio = new Date(desvio.fecha_inicio).getTime();
  const fin = new Date(desvio.fecha_fin).getTime();
  const ahora = Date.now();
  const total = Math.max(1, fin - inicio);
  // % de avance entre inicio y fin, clamped a [0,1].
  const progreso = Math.min(1, Math.max(0, (ahora - inicio) / total));
  const isPendiente = desvio.estado === "PENDIENTE";
  const isActivo = desvio.estado === "ACTIVO";
  const isResuelto = desvio.estado === "RESUELTO";
  const isCancelado = desvio.estado === "CANCELADO";

  // Caso especial: desvio sin fecha de fin. No tiene sentido pintar barra de
  // progreso ni "quedan X horas". Mostramos inicio + estado + barra "viva"
  // con animacion stripe mientras esta abierto. Cuando se cancela/resuelve,
  // la barra colapsa a un estado plano y mostramos cuanto duro.
  if (desvio.sin_fecha_fin) {
    const accent = ESTADO_ACCENT[desvio.estado];
    const enMarchaMs = Math.max(0, ahora - inicio);
    const contexto = (() => {
      if (isCancelado) return "Desvio cancelado, no se aplico.";
      if (isResuelto) {
        return `Desactivado tras ${formatDurationMs(new Date(desvio.actualizado_en).getTime() - inicio)}.`;
      }
      if (isPendiente) return "Pendiente de activacion manual.";
      return `Activo desde hace ${formatDurationMs(enMarchaMs)}. Permanecera vivo hasta que se desactive.`;
    })();
    const isVivo = !isCancelado && !isResuelto;
    return (
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-3)]">
              Inicio
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--color-text-1)]">
              {formatDateTime(desvio.fecha_inicio)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-3)]">
              Fin
            </p>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#7c3aed]">
              <InfinityIcon size={14} strokeWidth={2.2} />
              Sin fecha definida
            </p>
          </div>
        </div>

        {/* Barra "viva": fondo violeta y, cuando esta ACTIVO, lineas diagonales
            animadas que reflejan que el corte sigue en marcha sin un final
            predecible. Track violeta tenue para que se distinga visualmente
            de los desvios programados (que usan rojo/verde segun estado). */}
        <div className="relative h-3 overflow-hidden rounded-full bg-[rgba(124,58,237,0.10)] ring-1 ring-inset ring-[rgba(124,58,237,0.20)]">
          {isVivo ? (
            <>
              <div
                className={cn(
                  "absolute inset-0 rounded-full",
                  // Banda con animacion: lineas diagonales transparentes
                  // sobre violeta. Solo en ACTIVO; en PENDIENTE se ve atenuado.
                  isActivo
                    ? "bg-[repeating-linear-gradient(45deg,_#7c3aed_0_10px,_#9333ea_10px_20px)] animate-[move-stripes_2s_linear_infinite] shadow-[0_0_0_2px_rgba(124,58,237,0.18)]"
                    : "bg-[rgba(124,58,237,0.35)]",
                )}
                aria-hidden
              />
              {/* Brillo sutil sobre la barra para darle sensacion 3D. */}
              <div
                className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/15 to-transparent"
                aria-hidden
              />
            </>
          ) : (
            <div
              className={cn("absolute inset-0 rounded-full opacity-50", accent.fill)}
              aria-hidden
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--color-text-2)]">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={11} className="text-[var(--color-text-3)]" aria-hidden />
            {contexto}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(124,58,237,0.08)] px-2 py-0.5 text-[10.5px] font-medium text-[#7c3aed]">
            <InfinityIcon size={10} strokeWidth={2.2} />
            Sin caducidad automatica
          </span>
        </div>
      </div>
    );
  }

  // Mostramos la barra al 100% solo si el desvio esta RESUELTO o si ya paso
  // el fin (independientemente del estado, asi vemos "termino" aunque siga
  // marcado como ACTIVO por despiste del operador).
  const fillPct = isCancelado
    ? 0
    : isResuelto || ahora >= fin
      ? 1
      : isActivo
        ? progreso
        : 0;

  // Texto contextual debajo de la barra.
  const contexto = (() => {
    if (isCancelado) return "Desvio cancelado, no se aplico.";
    if (isResuelto) {
      return `Duro ${formatDuration(desvio.fecha_inicio, desvio.fecha_fin)}.`;
    }
    if (isPendiente) {
      const diff = inicio - ahora;
      if (diff <= 0) {
        return "Pendiente de confirmar (la hora prevista ya empezo).";
      }
      return `Comienza en ${formatDurationMs(diff)}.`;
    }
    if (isActivo) {
      const restante = fin - ahora;
      if (restante <= 0) {
        return "La hora prevista de fin ya paso; pendiente de cierre.";
      }
      return `Quedan ${formatDurationMs(restante)}.`;
    }
    return "";
  })();

  const accent = ESTADO_ACCENT[desvio.estado];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-3)]">
            Inicio
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--color-text-1)]">
            {formatDateTime(desvio.fecha_inicio)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-3)]">
            Fin {desvio.hora_fin_estimada ? "(aprox.)" : ""}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--color-text-1)]">
            {formatDateTime(desvio.fecha_fin)}
          </p>
        </div>
      </div>

      {/* Barra de progreso temporal. Track gris suave, fill segun estado. */}
      <div className="relative">
        <div className={cn("h-2 w-full rounded-full", accent.track)} aria-hidden />
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width]",
            accent.fill,
            isActivo ? "shadow-[0_0_0_2px_rgba(220,38,38,0.10)]" : null,
          )}
          style={{ width: `${(fillPct * 100).toFixed(2)}%` }}
          aria-hidden
        />
        {/* Marcador del momento "ahora" cuando el desvio esta en curso. */}
        {isActivo && fillPct > 0.02 && fillPct < 0.98 ? (
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-surface)] bg-[#dc2626] shadow-sm"
            style={{ left: `${(fillPct * 100).toFixed(2)}%` }}
            aria-label="Ahora"
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--color-text-2)]">
        <span className="inline-flex items-center gap-1.5">
          <Clock size={11} className="text-[var(--color-text-3)]" aria-hidden />
          {contexto}
        </span>
        <span className="font-mono text-[10.5px] text-[var(--color-text-3)]">
          Duracion total {formatDuration(desvio.fecha_inicio, desvio.fecha_fin)}
        </span>
      </div>
    </div>
  );
}

/** Igual que `formatDuration` pero recibe milisegundos en lugar de ISO strings. */
function formatDurationMs(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem === 0 ? `${hours} h` : `${hours} h ${rem} min`;
  const days = Math.floor(hours / 24);
  const hRem = hours % 24;
  return hRem === 0 ? `${days} d` : `${days} d ${hRem} h`;
}

/**
 * Tarjeta de "ficha rapida" en el sidebar: resume horario + duracion + lineas
 * en un vistazo, sin tener que mirar las cards mas extensas del cuerpo.
 * Es el primer bloque del sidebar para responder al operador "?cuando es y a
 * quien afecta?" en un parpadeo.
 */
function FichaRapidaCard({ desvio }: { desvio: DesvioDetalleType }) {
  const di = new Date(desvio.fecha_inicio);
  const df = new Date(desvio.fecha_fin);
  const sinFin = desvio.sin_fecha_fin;
  // Comparamos el dia en TZ Atlantic/Canary (no la del navegador) para que el
  // "mismo dia"/"+1d" coincida con la hora canaria que ve el operador.
  const pi = canaryParts(di);
  const pf = canaryParts(df);
  const sameDay =
    !sinFin && pi.year === pf.year && pi.month === pf.month && pi.day === pf.day;
  return (
    <section
      className={cn(
        "rounded-2xl border p-4 shadow-sm transition-colors",
        sinFin
          ? "border-[rgba(124,58,237,0.30)] bg-gradient-to-br from-[rgba(124,58,237,0.10)] via-[var(--color-surface)] to-[var(--color-surface-2)]"
          : "border-[var(--color-border)] bg-gradient-to-br from-[var(--color-accent-light)]/40 via-[var(--color-surface)] to-[var(--color-surface-2)]",
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-3)]">
        <Clock
          size={12}
          strokeWidth={1.8}
          className={cn(sinFin ? "text-[#7c3aed]" : "text-[var(--color-accent)]")}
          aria-hidden
        />
        Vista rapida
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--color-text-1)]">
          {formatHour(di)}
        </span>
        <ArrowRight
          size={14}
          strokeWidth={2}
          className={cn(sinFin ? "text-[#7c3aed]/70" : "text-[var(--color-accent)]/70")}
          aria-hidden
        />
        {sinFin ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(124,58,237,0.45)] bg-[rgba(124,58,237,0.12)] px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#7c3aed] shadow-[0_1px_3px_rgba(124,58,237,0.15)]"
            title="Sin fecha de fin: hasta que se desactive manualmente"
          >
            <span className="relative inline-flex h-1.5 w-1.5">
              <span
                className="absolute inset-0 animate-ping rounded-full bg-[#7c3aed] opacity-70"
                aria-hidden
              />
              <span
                className="relative h-1.5 w-1.5 rounded-full bg-[#7c3aed]"
                aria-hidden
              />
            </span>
            <InfinityIcon size={13} strokeWidth={2.4} aria-hidden />
            Hasta desactivar
          </span>
        ) : (
          <span className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--color-text-1)]">
            {formatHour(df)}
          </span>
        )}
        {!sinFin && desvio.hora_fin_estimada ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-[rgba(217,119,6,0.13)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#d97706]"
            title="Hora de fin estimada (previsiblemente)"
          >
            <Hourglass size={10} strokeWidth={2.2} aria-hidden />
            Aprox.
          </span>
        ) : null}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-text-2)]">
        <span>{formatShortDate(di)}</span>
        {sameDay || sinFin ? null : (
          <>
            <ArrowRight
              size={11}
              strokeWidth={2}
              className="text-[var(--color-text-3)]/70"
              aria-hidden
            />
            <span>{formatShortDate(df)}</span>
          </>
        )}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--color-border)]/70 pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-3)]">
            Duracion
          </p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-text-1)]">
            {sinFin ? (
              <>
                <InfinityIcon
                  size={12}
                  strokeWidth={2.2}
                  className="text-[var(--color-accent)]"
                  aria-hidden
                />
                <span>Indefinida</span>
              </>
            ) : (
              formatDuration(desvio.fecha_inicio, desvio.fecha_fin)
            )}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-3)]">
            Lineas
          </p>
          <div className="mt-0.5">
            {desvio.lineas_afectadas.length === 0 ? (
              <p className="text-[13px] text-[var(--color-text-3)]">{"\u2014"}</p>
            ) : (
              <LineasChips lineas={desvio.lineas_afectadas} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatHour(d: Date): string {
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Atlantic/Canary",
  });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Atlantic/Canary",
  });
}

function Timeline({ desvio }: { desvio: DesvioDetalleType }) {
  type TimelineEvent = {
    label: string;
    icon: typeof CheckCircle2;
    timestamp: string;
    tone: "muted" | "amber" | "rose" | "emerald" | "accent";
  };
  const events: TimelineEvent[] = [
    {
      label: desvio.origen === "EMAIL" ? "Creado automaticamente desde correo" : "Creado manualmente",
      icon: desvio.origen === "EMAIL" ? Send : Pencil,
      timestamp: desvio.creado_en,
      tone: "accent",
    },
  ];
  if (desvio.confirmado_en) {
    events.push({
      label: `Confirmado por ${desvio.confirmado_por ?? "operador"}`,
      icon: ShieldCheck,
      timestamp: desvio.confirmado_en,
      tone: "rose",
    });
  }
  if (desvio.estado === "RESUELTO") {
    events.push({
      label: "Marcado como resuelto",
      icon: CheckCircle2,
      timestamp: desvio.actualizado_en,
      tone: "emerald",
    });
  } else if (desvio.estado === "CANCELADO") {
    events.push({
      label: "Cancelado",
      icon: CircleSlash,
      timestamp: desvio.actualizado_en,
      tone: "muted",
    });
  } else {
    events.push({
      label: "Ultima actualizacion",
      icon: Clock,
      timestamp: desvio.actualizado_en,
      tone: "muted",
    });
  }

  return (
    <ol className="relative space-y-3 pl-4">
      <span
        aria-hidden
        className="absolute left-[6px] top-1 bottom-1 w-px bg-[var(--color-border)]"
      />
      {events.map((event, idx) => {
        const Icon = event.icon;
        const tonePalette: Record<TimelineEvent["tone"], string> = {
          accent: "bg-[var(--color-accent)] text-white",
          amber: "bg-[#d97706] text-white",
          rose: "bg-[#dc2626] text-white",
          emerald: "bg-[#059669] text-white",
          muted: "bg-[var(--color-surface-3)] text-[var(--color-text-2)] border border-[var(--color-border)]",
        };
        return (
          <li key={`${event.label}-${idx}`} className="relative">
            <span
              className={cn(
                "absolute -left-[13px] top-0 flex h-5 w-5 items-center justify-center rounded-full shadow-sm",
                tonePalette[event.tone],
              )}
              aria-hidden
            >
              <Icon size={10} strokeWidth={2.2} />
            </span>
            <div className="pl-5">
              <p className="text-[12.5px] font-medium text-[var(--color-text-1)]">{event.label}</p>
              <p className="text-[11px] text-[var(--color-text-3)]">{formatDateTime(event.timestamp)}</p>
            </div>
          </li>
        );
      })}
      {desvio.estado === "PENDIENTE" ? (
        <li className="relative">
          <span
            className="absolute -left-[13px] top-0 flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-[var(--color-border-hover)] bg-[var(--color-surface)] text-[var(--color-text-3)]"
            aria-hidden
          >
            <AlertCircle size={10} strokeWidth={1.8} />
          </span>
          <div className="pl-5 text-[12px] text-[var(--color-text-3)]">
            Esperando confirmacion del operador.
          </div>
        </li>
      ) : null}
    </ol>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Atlantic/Canary",
  });
}

function formatDuration(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const minutes = Math.max(0, Math.round((end - start) / (1000 * 60)));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hours} h`;
  return `${hours} h ${rem} min`;
}
