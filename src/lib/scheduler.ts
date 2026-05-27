/**
 * Scheduler interno de la aplicación.
 *
 * Concentra todas las tareas periódicas que el centro de control necesita:
 *
 *  1. **Informe diario automático** (`runDailyReport`): genera el XLSX del
 *     día y lo envía por email a los buzones operativos cuando llega la
 *     hora configurada (por defecto 22:00 hora local). Sólo se envía una
 *     vez por día — se comprueba con la tabla `DailyReport` (igual que el
 *     botón manual de "Generar informe").
 *
 *  2. **Reglas automáticas** (`runRules`): cada tick recorre los tickets
 *     abiertos buscando situaciones que requieran intervención:
 *      - Sin asignar + edad > umbral por prioridad → email al centro de
 *        control y `auditEvent` `ticket.escalated`.
 *      - SLA a punto de vencer (< 15 min) → notifica al técnico asignado.
 *     Para evitar duplicados se comprueba si ya existe un `AuditEvent` del
 *     mismo tipo y ticket en las últimas N horas.
 *
 * Diseño:
 *  - Singleton por proceso (NSSM mantiene un único Node activo).
 *  - `setInterval` con jitter pequeño (60s) para no coincidir con el
 *    poller de desvíos.
 *  - Tolerante a fallos: cualquier excepción se logea pero no para el
 *    scheduler.
 *  - Configuración por env:
 *      `SCHEDULER_ENABLED=true|false` (default true en producción).
 *      `DAILY_REPORT_HOUR=22` (0-23).
 *      `SCHEDULER_TICK_SECONDS=300` (rango sano: 60..900).
 *
 * Las funciones públicas son `getScheduler()` y `Scheduler.runOnce()` para
 * permitir disparos manuales desde un endpoint admin.
 */

import { buildDailyReportXlsx, type DailyReportRow } from "@/lib/daily-report-xlsx";
import type { TicketPriority, TicketStatus } from "@/lib/domain";
import {
  opsInboxEmails,
  renderTicketEmail,
  sendDirectEmail,
  sendUserEmail,
  ticketAbsoluteUrl,
} from "@/lib/email-notifications";
import { prisma } from "@/lib/prisma";

type SchedulerStatus = {
  enabled: boolean;
  running: boolean;
  intervalSeconds: number;
  dailyReportHour: number;
  lastTickAt: string | null;
  lastDailyReportAt: string | null;
  lastError: string | null;
  ticksTotal: number;
  ticketsEscalated: number;
  ticketsSlaWarned: number;
};

type RuleConfig = {
  /** Min de antigüedad sin asignar a partir del cual se considera escalado. */
  unassignedAgeMinutes: Record<TicketPriority, number>;
  /** Min antes del vencimiento de SLA para avisar al asignado. */
  slaWarnMinutes: number;
};

const DEFAULT_RULES: RuleConfig = {
  unassignedAgeMinutes: { alta: 15, media: 60, baja: 240 },
  slaWarnMinutes: 15,
};

function readEnvBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v == null) return defaultValue;
  const trimmed = v.trim().toLowerCase();
  if (trimmed === "true" || trimmed === "1") return true;
  if (trimmed === "false" || trimmed === "0") return false;
  return defaultValue;
}

function readEnvInt(name: string, defaultValue: number, min: number, max: number): number {
  const v = process.env[name];
  if (v == null) return defaultValue;
  const n = Number(v);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function formatLocalIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function computeDayBounds(d: Date): { startOfDay: Date; endOfDay: Date } {
  const startOfDay = new Date(d);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(d);
  endOfDay.setHours(23, 59, 59, 999);
  return { startOfDay, endOfDay };
}

function buildTipoLabel(
  tipo: string | null,
  subtipo: string | null,
  subsubtipo: string | null,
): string {
  const parts = [tipo, subtipo, subsubtipo].filter((p): p is string => !!p && p.trim().length > 0);
  if (parts.length === 0) return "Sin clasificar";
  return parts.join(" · ");
}

class Scheduler {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private enabled = readEnvBool("SCHEDULER_ENABLED", true);
  private intervalSeconds = readEnvInt("SCHEDULER_TICK_SECONDS", 300, 60, 900);
  private dailyReportHour = readEnvInt("DAILY_REPORT_HOUR", 22, 0, 23);
  private lastTickAt: Date | null = null;
  private lastDailyReportAt: Date | null = null;
  private lastError: string | null = null;
  private ticksTotal = 0;
  private ticketsEscalated = 0;
  private ticketsSlaWarned = 0;
  private rules: RuleConfig = DEFAULT_RULES;

  status(): SchedulerStatus {
    return {
      enabled: this.enabled,
      running: this.timerId !== null,
      intervalSeconds: this.intervalSeconds,
      dailyReportHour: this.dailyReportHour,
      lastTickAt: this.lastTickAt ? this.lastTickAt.toISOString() : null,
      lastDailyReportAt: this.lastDailyReportAt ? this.lastDailyReportAt.toISOString() : null,
      lastError: this.lastError,
      ticksTotal: this.ticksTotal,
      ticketsEscalated: this.ticketsEscalated,
      ticketsSlaWarned: this.ticketsSlaWarned,
    };
  }

  start(): SchedulerStatus {
    if (!this.enabled) {
      console.log("[scheduler] deshabilitado por configuración (SCHEDULER_ENABLED=false)");
      return this.status();
    }
    if (this.timerId) return this.status();

    // Primer disparo inmediato (no bloqueante) para no esperar al intervalo.
    void this.runOnce();
    this.timerId = setInterval(
      () => {
        void this.runOnce();
      },
      this.intervalSeconds * 1000,
    );
    console.log(`[scheduler] arrancado · tick=${this.intervalSeconds}s · dailyHour=${this.dailyReportHour}`);
    return this.status();
  }

  stop(): SchedulerStatus {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    return this.status();
  }

  async runOnce(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    this.ticksTotal++;
    this.lastTickAt = new Date();
    try {
      await this.runDailyReport();
      await this.runRules();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.warn("[scheduler] tick error:", error);
    } finally {
      this.inFlight = false;
    }
  }

  private async runDailyReport(): Promise<void> {
    const now = new Date();
    if (now.getHours() !== this.dailyReportHour) return;

    const reportDate = formatLocalIsoDate(now);

    // Si ya hay un informe del día (manual o automático) no repetimos.
    const already = await prisma.dailyReport.findFirst({
      where: { reportDate },
      select: { id: true },
    });
    if (already) return;

    const { startOfDay, endOfDay } = computeDayBounds(now);
    const tickets = await prisma.ticket.findMany({
      where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      orderBy: { createdAt: "asc" },
      include: { bus: { select: { operator: true } } },
    });

    const rows: DailyReportRow[] = tickets.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      busId: t.busId,
      operator: t.bus.operator,
      lineaLabel: t.lineaLabel ?? null,
      servicioLabel: t.servicioLabel ?? null,
      conductorLabel: t.conductorLabel ?? null,
      tipoLabel: buildTipoLabel(t.tipo, t.subtipo, t.subsubtipo),
      status: t.status as TicketStatus,
      priority: t.priority as TicketPriority,
      title: t.title,
      description: t.description,
    }));

    const buffer = await buildDailyReportXlsx(rows, {
      reportDate: now,
      generatedAt: now,
      generatedByName: "Sistema (automático)",
      generatedByEmail: "",
      previousGenerations: 0,
    });

    await prisma.dailyReport.create({
      data: {
        reportDate,
        ticketCount: rows.length,
        // generatedById queda en null porque no hay un usuario humano.
        generatedById: null,
      },
    });

    const recipients = opsInboxEmails();
    if (recipients.length > 0) {
      const base64 = Buffer.from(buffer).toString("base64");
      await sendDirectEmail({
        to: recipients,
        subject: `[CCMGC] Informe diario · ${reportDate} (${rows.length} incidencias)`,
        html: `
          <p>Buenas tardes,</p>
          <p>Adjunto el informe diario del <b>${reportDate}</b> con un total de
          <b>${rows.length}</b> incidencias registradas.</p>
          <p>Este correo se genera automáticamente al cierre de la jornada
          (${String(this.dailyReportHour).padStart(2, "0")}:00). Si ya tenéis una
          versión manual, prevalece la última generada.</p>
          <p>— CCMGC Ticketing</p>`,
        attachments: [
          {
            filename: `informe-incidencias-${reportDate}.xlsx`,
            content: base64,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        ],
        dedupeKey: `daily-report:${reportDate}`,
      });
    }

    this.lastDailyReportAt = now;
    console.log(`[scheduler] informe diario generado y enviado a ${recipients.length} buzón(es)`);
  }

  private async runRules(): Promise<void> {
    const now = new Date();

    // 1) Auto-escalación: tickets sin asignar, abiertos, con cierta edad
    //    según prioridad. Buscamos solo los que aún no han sido escalados
    //    (no hay AuditEvent ticket.escalated previo).
    const ageMaxByPriority = this.rules.unassignedAgeMinutes;
    const olderThan = new Date(
      now.getTime() - Math.min(...Object.values(ageMaxByPriority)) * 60 * 1000,
    );

    const unassigned = await prisma.ticket.findMany({
      where: {
        assignedToUserId: null,
        status: { in: ["abierto", "en_proceso"] satisfies TicketStatus[] },
        createdAt: { lte: olderThan },
      },
      select: {
        id: true,
        title: true,
        busId: true,
        priority: true,
        status: true,
        createdAt: true,
        slaDeadline: true,
      },
    });

    for (const ticket of unassigned) {
      const minutesOld = (now.getTime() - ticket.createdAt.getTime()) / 60_000;
      const threshold = ageMaxByPriority[ticket.priority as TicketPriority] ?? 60;
      if (minutesOld < threshold) continue;

      // ¿Ya escalado anteriormente?
      const previous = await prisma.auditEvent.findFirst({
        where: { ticketId: ticket.id, action: "ticket.escalated" },
        select: { id: true },
      });
      if (previous) continue;

      const recipients = opsInboxEmails();
      if (recipients.length > 0) {
        const { subject, html } = renderTicketEmail({
          headline: "Ticket sin asignar — escalado automático",
          body: `El ticket lleva <b>${Math.round(minutesOld)} min</b> sin asignar, supera el umbral de <b>${threshold} min</b> para la prioridad <b>${ticket.priority}</b>.`,
          ticketId: ticket.id,
          ticketTitle: ticket.title,
          busId: ticket.busId,
          status: ticket.status,
          priority: ticket.priority,
          actor: "Sistema (regla)",
        });
        await sendDirectEmail({
          to: recipients,
          subject,
          html,
          dedupeKey: `escalate:${ticket.id}`,
        });
      }

      await prisma.auditEvent.create({
        data: {
          ticketId: ticket.id,
          action: "ticket.escalated",
          detail: `Auto-escalado tras ${Math.round(minutesOld)} min sin asignar`,
        },
      });
      this.ticketsEscalated++;
    }

    // 2) Aviso SLA próximo a vencer (< slaWarnMinutes). Solo se notifica al
    //    técnico asignado (si lo hay). Una vez por ticket: usamos audit event
    //    `ticket.sla_warned`.
    const horizon = new Date(now.getTime() + this.rules.slaWarnMinutes * 60_000);
    const slaCandidates = await prisma.ticket.findMany({
      where: {
        assignedToUserId: { not: null },
        status: { in: ["abierto", "en_proceso", "esperando_repuesto"] satisfies TicketStatus[] },
        slaDeadline: { gt: now, lte: horizon },
      },
      select: {
        id: true,
        title: true,
        busId: true,
        priority: true,
        status: true,
        slaDeadline: true,
        assignedToUserId: true,
      },
    });

    for (const ticket of slaCandidates) {
      const previous = await prisma.auditEvent.findFirst({
        where: { ticketId: ticket.id, action: "ticket.sla_warned" },
        select: { id: true },
      });
      if (previous) continue;
      const minutesLeft = Math.round((ticket.slaDeadline.getTime() - now.getTime()) / 60_000);

      if (ticket.assignedToUserId) {
        const { subject, html } = renderTicketEmail({
          headline: "SLA a punto de vencer",
          body: `Quedan <b>${minutesLeft} min</b> antes del vencimiento del SLA. <a href="${ticketAbsoluteUrl(ticket.id)}">Atender ahora</a>.`,
          ticketId: ticket.id,
          ticketTitle: ticket.title,
          busId: ticket.busId,
          status: ticket.status,
          priority: ticket.priority,
        });
        await sendUserEmail({
          userIds: [ticket.assignedToUserId],
          subject,
          html,
          dedupeKey: `sla-warn:${ticket.id}`,
        });
      }

      await prisma.auditEvent.create({
        data: {
          ticketId: ticket.id,
          action: "ticket.sla_warned",
          detail: `SLA a ${minutesLeft} min del vencimiento`,
        },
      });
      this.ticketsSlaWarned++;
    }
  }
}

let _instance: Scheduler | null = null;
export function getScheduler(): Scheduler {
  if (!_instance) _instance = new Scheduler();
  return _instance;
}
