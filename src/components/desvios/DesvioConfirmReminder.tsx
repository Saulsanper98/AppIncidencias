"use client";

import {
  ArrowRight,
  Bus,
  CheckCircle2,
  Clock,
  Flag,
  MapPin,
  PlayCircle,
  Route,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EstadoBadge } from "@/components/desvios/EstadoBadge";
import { OrigenBadge } from "@/components/desvios/OrigenBadge";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { toast } from "@/components/toast-host";
import { useSseEvent } from "@/hooks/use-sse-event";
import type { SessionUser } from "@/lib/domain";
import {
  DESVIO_REMINDER_MINUTES,
  DESVIO_REMINDER_MS,
  pickDueDesvioReminder,
  type DesvioReminderItem,
  type DesvioReminderKind,
  type DesvioRemindersSnapshot,
} from "@/lib/desvios/reminder-logic";
import { canManageDesvios } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export {
  DESVIO_REMINDER_MINUTES as REMINDER_MINUTES,
  needsDesvioConfirmReminder,
  needsDesvioEndReminder,
  needsDesvioStartReminder,
} from "@/lib/desvios/reminder-logic";
export type { DesvioReminderKind, DesvioReminderItem as DesvioReminderTarget } from "@/lib/desvios/reminder-logic";

const SYNC_MS = 10_000;
const EVALUATE_MS = 1_000;
const TICK_MS = 1_000;
const DISMISS_KEY = "ccmgc_desvio_reminder_dismissed";

const REMINDER_THEME = {
  start: {
    title: "Confirmar desvío",
    subtitle: "Inicio programado",
    action: "Confirmar y activar",
    eventLabel: "Inicio",
    Icon: PlayCircle,
    panel:
      "border-t-[3px] border-t-[#d97706] shadow-[0_24px_48px_-28px_rgba(217,119,6,0.55)]",
    hero: "from-[rgba(217,119,6,0.16)] via-[rgba(217,119,6,0.06)] to-transparent",
    iconWrap: "bg-[rgba(217,119,6,0.16)] text-[#d97706] ring-[rgba(217,119,6,0.28)]",
    urgencyUpcoming: "border-[rgba(217,119,6,0.35)] bg-[rgba(217,119,6,0.12)] text-[#d97706]",
    urgencyOverdue: "border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.12)] text-[#dc2626]",
    progress: "bg-[#d97706]",
    progressTrack: "bg-[rgba(217,119,6,0.14)]",
  },
  end: {
    title: "Finalizar desvío",
    subtitle: "Fin programado",
    action: "Marcar como resuelto",
    eventLabel: "Fin",
    Icon: Flag,
    panel:
      "border-t-[3px] border-t-[#059669] shadow-[0_24px_48px_-28px_rgba(5,150,105,0.45)]",
    hero: "from-[rgba(5,150,105,0.16)] via-[rgba(5,150,105,0.06)] to-transparent",
    iconWrap: "bg-[rgba(5,150,105,0.16)] text-[#059669] ring-[rgba(5,150,105,0.28)]",
    urgencyUpcoming: "border-[rgba(5,150,105,0.35)] bg-[rgba(5,150,105,0.12)] text-[#059669]",
    urgencyOverdue: "border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.12)] text-[#dc2626]",
    progress: "bg-[#059669]",
    progressTrack: "bg-[rgba(5,150,105,0.14)]",
  },
} as const;

function dismissKey(kind: DesvioReminderKind, id: string): string {
  return `${kind}:${id}`;
}

function readDismissedKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistDismissedKeys(keys: Set<string>) {
  sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...keys]));
}

function dismissReminder(kind: DesvioReminderKind, id: string) {
  const keys = readDismissedKeys();
  keys.add(dismissKey(kind, id));
  persistDismissedKeys(keys);
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Atlantic/Canary",
  });
}

function formatUrgency(msUntil: number, kind: DesvioReminderKind) {
  const eventWord = kind === "start" ? "inicio" : "fin";
  if (msUntil <= 0) {
    const minsLate = Math.max(1, Math.ceil(Math.abs(msUntil) / 60_000));
    return {
      value: minsLate >= 60 ? `+${Math.floor(minsLate / 60)} h` : `+${minsLate} min`,
      caption: `${eventWord.charAt(0).toUpperCase()}${eventWord.slice(1)} retrasado`,
      overdue: true,
    };
  }
  const totalSeconds = Math.ceil(msUntil / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return {
    value: mins >= 1 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}s`,
    caption: mins >= 1 ? "min restantes" : "seg restantes",
    overdue: false,
  };
}

function reminderMessage(kind: DesvioReminderKind, overdue: boolean): string {
  if (kind === "start") {
    return overdue
      ? "El desvío debería estar ya activo. Confírmalo para que quede operativo en el sistema."
      : `Quedan menos de ${DESVIO_REMINDER_MINUTES} minutos para el inicio. Confírmalo antes de que empiece.`;
  }
  return overdue
    ? "La hora de fin ya pasó. Si el corte ha terminado, márcalo como resuelto."
    : `Quedan menos de ${DESVIO_REMINDER_MINUTES} minutos para el fin programado. Prepárate para cerrarlo.`;
}

function urgencyProgress(msUntil: number): number {
  if (msUntil <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - msUntil / DESVIO_REMINDER_MS));
}

function DesvioReminderDialog({
  target,
  acting,
  onDismiss,
  onViewDetail,
  onAction,
}: {
  target: DesvioReminderItem;
  acting: boolean;
  onDismiss: () => void;
  onViewDetail: () => void;
  onAction: () => void;
}) {
  const { kind, desvio } = target;
  const theme = REMINDER_THEME[kind];
  const ThemeIcon = theme.Icon;
  const eventIso = kind === "start" ? desvio.fecha_inicio : desvio.fecha_fin;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const eventMs = new Date(eventIso).getTime();
  const msUntil = eventMs - now;
  const overdue = msUntil <= 0;
  const urgency = formatUrgency(msUntil, kind);
  const progress = urgencyProgress(msUntil);
  const lineas = desvio.lineas_afectadas;

  return (
    <ModalShell
      open
      onClose={onDismiss}
      size="lg"
      maxWidth="34rem"
      className={cn(theme.panel, overdue && "border-t-[#dc2626]")}
      title={
        <span className="inline-flex items-center gap-2.5">
          <span
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-xl ring-1",
              theme.iconWrap,
              overdue && "bg-[rgba(220,38,38,0.14)] text-[#dc2626] ring-[rgba(220,38,38,0.28)]",
            )}
          >
            <ThemeIcon size={16} strokeWidth={2} aria-hidden />
          </span>
          {theme.title}
        </span>
      }
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onViewDetail}
            disabled={acting}
            className="hidden text-[13px] text-[var(--color-text-3)] transition-colors hover:text-[var(--color-accent)] sm:inline-flex sm:items-center sm:gap-1"
          >
            Ver ficha completa
            <ArrowRight size={14} aria-hidden />
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onDismiss} disabled={acting}>
              Ahora no
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={acting}
              onClick={onViewDetail}
              className="sm:hidden"
            >
              Ver detalle
            </Button>
            <Button
              type="button"
              startIcon={<CheckCircle2 size={16} aria-hidden />}
              loading={acting}
              onClick={onAction}
              className="min-w-[11rem]"
            >
              {theme.action}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          className={cn(
            "relative overflow-hidden rounded-xl bg-gradient-to-b px-4 pb-4 pt-3",
            theme.hero,
            overdue && "from-[rgba(220,38,38,0.14)] via-[rgba(220,38,38,0.05)]",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-3)]">
                {theme.subtitle}
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-text-2)]">
                {reminderMessage(kind, overdue)}
              </p>
            </div>
            <div
              className={cn(
                "flex shrink-0 flex-col items-center rounded-2xl border px-3 py-2 text-center",
                overdue ? theme.urgencyOverdue : theme.urgencyUpcoming,
              )}
            >
              <span className="font-mono text-2xl font-bold leading-none tabular-nums">
                {urgency.value}
              </span>
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.06em]">
                {urgency.caption}
              </span>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-[var(--color-text-3)]">
              <span>Ventana de aviso ({DESVIO_REMINDER_MINUTES} min)</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className={cn("h-1.5 overflow-hidden rounded-full", theme.progressTrack)}>
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-1000 ease-linear",
                  overdue ? "bg-[#dc2626]" : theme.progress,
                )}
                style={{ width: `${(progress * 100).toFixed(1)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EstadoBadge estado={desvio.estado} size="sm" />
          <OrigenBadge origen={desvio.origen} size="sm" />
          {desvio.hora_fin_estimada && kind === "end" ? (
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-[var(--color-text-3)]">
              Fin aprox.
            </span>
          ) : null}
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
          <p className="font-mono text-[11px] text-[var(--color-text-3)]">{desvio.referencia}</p>
          <div className="mt-1 flex items-start gap-2">
            <Route size={16} className="mt-0.5 shrink-0 text-[var(--color-accent)]" aria-hidden />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug text-[var(--color-text-1)]">
                {desvio.via}
              </p>
              <p className="mt-1 flex items-start gap-1.5 text-[13px] text-[var(--color-text-2)]">
                <MapPin size={13} className="mt-0.5 shrink-0 text-[var(--color-text-3)]" aria-hidden />
                <span>{desvio.tramo}</span>
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-surface)]/60 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--color-text-3)]">
                {theme.eventLabel}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-text-1)]">
                <Clock size={13} className="text-[var(--color-text-3)]" aria-hidden />
                {formatWhen(eventIso)}
              </p>
            </div>
            {lineas.length > 0 ? (
              <div className="rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-surface)]/60 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--color-text-3)]">
                  Líneas
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {lineas.map((linea) => (
                    <span
                      key={linea}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[12px] font-semibold text-[var(--color-text-1)]"
                    >
                      <Bus size={11} className="text-[var(--color-text-3)]" aria-hidden />
                      {linea}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {desvio.motivo ? (
            <p className="mt-3 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-[12.5px] text-[var(--color-text-2)]">
              <span className="font-medium text-[var(--color-text-1)]">Motivo: </span>
              {desvio.motivo}
            </p>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}

type Props = {
  sessionUser?: SessionUser | null;
};

/**
 * Modal global que avisa a los operadores cuando un desvío está a 10 minutos
 * (o menos) de su hora de inicio (PENDIENTE → confirmar) o de fin (ACTIVO →
 * resolver). El servidor calcula qué desvíos entran en ventana; el cliente
 * programa el instante exacto del siguiente aviso.
 */
export function DesvioConfirmReminder({ sessionUser = null }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(sessionUser);
  const canManage = useMemo(
    () => Boolean(session && !session.isReadOnly && canManageDesvios(session.role)),
    [session],
  );

  const [active, setActive] = useState<DesvioReminderItem | null>(null);
  const [acting, setActing] = useState(false);
  const dismissedRef = useRef<Set<string>>(readDismissedKeys());
  const dueRef = useRef<DesvioReminderItem[]>([]);
  const nextWakeAtRef = useRef<string | null>(null);
  const syncInFlightRef = useRef(false);
  const canManageRef = useRef(false);
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSession(sessionUser);
  }, [sessionUser]);

  useEffect(() => {
    if (sessionUser) return;
    const loadSession = async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { authenticated?: boolean; user?: SessionUser };
        if (data.authenticated && data.user) setSession(data.user);
      } catch {
        // ignore
      }
    };
    void loadSession();
  }, [sessionUser]);

  useEffect(() => {
    canManageRef.current = canManage;
  }, [canManage]);

  const applySnapshot = useCallback((data: DesvioRemindersSnapshot) => {
    dueRef.current = data.due ?? [];
    nextWakeAtRef.current = data.nextWakeAt ?? null;
    setActive(pickDueDesvioReminder(dueRef.current, dismissedRef.current));
  }, []);

  const evaluateReminders = useCallback(() => {
    if (!canManageRef.current) return;
    setActive(pickDueDesvioReminder(dueRef.current, dismissedRef.current));
  }, []);

  const syncRemindersRef = useRef<() => Promise<void>>(async () => {});

  const scheduleNextWake = useCallback(() => {
    if (wakeTimerRef.current) {
      clearTimeout(wakeTimerRef.current);
      wakeTimerRef.current = null;
    }
    const wakeAt = nextWakeAtRef.current;
    if (!wakeAt) return;
    const delay = new Date(wakeAt).getTime() - Date.now() + 300;
    if (delay <= 0) {
      wakeTimerRef.current = setTimeout(() => void syncRemindersRef.current(), 500);
      return;
    }
    wakeTimerRef.current = setTimeout(() => {
      void syncRemindersRef.current();
    }, delay);
  }, []);

  const syncReminders = useCallback(async () => {
    if (!canManageRef.current || syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      const res = await fetch("/api/desvios/reminders", {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as DesvioRemindersSnapshot;
      applySnapshot(data);
      scheduleNextWake();
    } catch {
      // ignore
    } finally {
      syncInFlightRef.current = false;
    }
  }, [applySnapshot, scheduleNextWake]);

  syncRemindersRef.current = syncReminders;

  const showReminderItem = useCallback((item: DesvioReminderItem) => {
    if (!canManageRef.current) return;
    const key = dismissKey(item.kind, item.desvio.id);
    if (dismissedRef.current.has(key)) return;
    dueRef.current = [
      ...dueRef.current.filter(
        (existing) => !(existing.kind === item.kind && existing.desvio.id === item.desvio.id),
      ),
      item,
    ];
    setActive(item);
  }, []);

  useEffect(() => {
    if (!canManage) {
      dueRef.current = [];
      nextWakeAtRef.current = null;
      setActive(null);
      return;
    }

    void syncRemindersRef.current();

    const evaluateTimer = window.setInterval(evaluateReminders, EVALUATE_MS);
    const syncTimer = window.setInterval(() => void syncRemindersRef.current(), SYNC_MS);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      evaluateReminders();
      void syncRemindersRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearInterval(evaluateTimer);
      window.clearInterval(syncTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      if (wakeTimerRef.current) {
        clearTimeout(wakeTimerRef.current);
        wakeTimerRef.current = null;
      }
    };
  }, [canManage, evaluateReminders]);

  useSseEvent("desvio_recordatorio", (event) => {
    try {
      const parsed = JSON.parse(event.data) as { payload?: DesvioReminderItem };
      if (parsed.payload?.desvio?.id && parsed.payload.kind) {
        showReminderItem(parsed.payload);
      }
    } catch {
      // ignore
    }
  });

  useSseEvent("desvio_nuevo", () => {
    void syncRemindersRef.current();
  });
  useSseEvent("desvio_actualizado", () => {
    void syncRemindersRef.current();
  });

  const handleDismiss = () => {
    if (!active) return;
    dismissReminder(active.kind, active.desvio.id);
    dismissedRef.current.add(dismissKey(active.kind, active.desvio.id));
    setActive(null);
    evaluateReminders();
  };

  const handleViewDetail = () => {
    if (!active) return;
    const id = active.desvio.id;
    setActive(null);
    router.push(`/desvios/${id}`);
  };

  const handleAction = async () => {
    if (!active || acting) return;
    setActing(true);
    const { kind, desvio } = active;
    const endpoint = kind === "start" ? "confirmar" : "resolver";
    try {
      const res = await fetch(`/api/desvios/${desvio.id}/${endpoint}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(
          data.message ?? (kind === "start" ? "No se pudo confirmar" : "No se pudo resolver"),
        );
      }
      dismissReminder(kind, desvio.id);
      dismissedRef.current.add(dismissKey(kind, desvio.id));
      toast.success(kind === "start" ? "Desvío confirmado y activo" : "Desvío marcado como resuelto");
      setActive(null);
      void syncRemindersRef.current();
    } catch (err) {
      toast.error(kind === "start" ? "Error al confirmar" : "Error al resolver", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setActing(false);
    }
  };

  if (!canManage || !active) return null;

  return (
    <DesvioReminderDialog
      target={active}
      acting={acting}
      onDismiss={handleDismiss}
      onViewDetail={handleViewDetail}
      onAction={() => void handleAction()}
    />
  );
}
