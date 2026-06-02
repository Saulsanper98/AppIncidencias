import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/rbac";
import { excludedUsersSqlFilter } from "@/lib/ux-exclusions";

/**
 * GET /api/admin/analytics/summary?days=7
 *
 * Devuelve agregaciones para la página /admin/analytics. Solo accesible
 * para gestores del centro de control (mismo permiso que admin de usuarios).
 *
 * Parámetros:
 *   - `days`: ventana temporal en días (1, 7, 30, 90). Por defecto 7.
 *
 * Todas las agregaciones se hacen con SQL crudo (SQLite) porque queremos
 * GROUP BYs eficientes y porque el cliente Prisma puede ir un build detrás
 * del schema en arranques recién migrados (Windows + DLL bloqueada).
 */

type SummaryRow = {
  page_visits: {
    path: string | null;
    visits: number;
    total_ms: number;
    avg_ms: number;
  }[];
  top_searches: {
    query: string;
    n: number;
    avg_results: number;
  }[];
  errors: {
    message: string;
    n: number;
    last_at: string;
  }[];
  funnels: {
    flow: string;
    opens: number;
    completes: number;
    abandons: number;
    avg_complete_ms: number;
  }[];
  ticket_create_by_user: {
    userId: string | null;
    name: string | null;
    completes: number;
    avg_ms: number;
    median_ms: number;
  }[];
  by_shift: {
    shift: string;
    events: number;
    visits: number;
    creates: number;
  }[];
  ranking: {
    userId: string;
    name: string;
    role: string | null;
    tickets_created: number;
    tickets_resolved: number;
    page_visits: number;
    active_minutes: number;
  }[];
  active_users: {
    today: number;
    week: number;
  };
  totals: {
    events: number;
    sessions: number;
    // Deltas respecto al periodo anterior del mismo tamaño.
    events_prev?: number;
    sessions_prev?: number;
  };
  // ── Nuevas secciones ───────────────────────────────────────────────────
  /**
   * Matriz 7 (días, 0=Dom .. 6=Sáb) × 24 (horas). Valor = nº de eventos.
   * Útil para detectar picos horarios y días flojos.
   */
  heatmap: number[][];
  /** Serie temporal: eventos por día en el rango (rellena días vacíos). */
  timeseries: { date: string; events: number; visits: number; creates: number }[];
  /** Errores de API agregados por endpoint+status. */
  api_errors: { path: string; status: number; n: number; avg_ms: number; last_at: string }[];
  /** Segmentación por rol (de los UxEvent). */
  by_role: { role: string; events: number; users: number }[];
  /** Métricas reales de tickets (datos de Ticket, no telemetría). */
  tickets: {
    created: number;
    resolved: number;
    open: number;
    sla_breached: number;
    sla_total: number;
    /** Mean Time To Resolution en minutos. */
    mttr_minutes: number;
    median_resolution_minutes: number;
    by_priority: { priority: string; n: number; resolved: number }[];
    top_buses: { busId: string; n: number }[];
  };
  /** Resumen de delta vs periodo anterior para mostrar tendencias. */
  trends: {
    events: { value: number; prev: number; delta_pct: number | null };
    sessions: { value: number; prev: number; delta_pct: number | null };
    tickets_resolved: { value: number; prev: number; delta_pct: number | null };
    tickets_created: { value: number; prev: number; delta_pct: number | null };
  };
};

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageUsers(actor.role)) {
      return NextResponse.json({ message: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const daysRaw = Number(searchParams.get("days") ?? "7");
    const days = [1, 7, 30, 90].includes(daysRaw) ? daysRaw : 7;
    const now = Date.now();
    const since = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    /**
     * Periodo anterior del mismo tamaño, para calcular deltas. Si los días
     * son 7, comparamos esos 7 días vs los 7 anteriores; permite ver
     * tendencias sin requerir UI extra al usuario.
     */
    const prevSince = new Date(now - 2 * days * 24 * 60 * 60 * 1000).toISOString();
    const prevUntil = since;

    // Filtro común para excluir cuentas dueño/dev de TODAS las agregaciones.
    // Se construye una sola vez por request (caché 60s en getMetricsExcludedUserIds).
    const exclUx = await excludedUsersSqlFilter("userId");
    // Para sub-SELECT contra User (tabla ranking) usamos `u.id` directamente.
    const exclUser = await excludedUsersSqlFilter("u.id");
    // Para tickets resueltos filtramos por assignedToUserId.
    const exclAssign = await excludedUsersSqlFilter("assignedToUserId");

    // ─── Visitas por sección ───────────────────────────────────────────────
    // Sumamos duración por path. Normalizamos sub-rutas al primer segmento
    // (/tickets/abc → /tickets) para que las páginas con detalle no
    // ensucien el ranking. Usamos un sub-SELECT porque SQLite agruparía por
    // la columna real `path` si pusiéramos `GROUP BY path` arriba.
    const pageRows = await prisma.$queryRawUnsafe<
      { path: string | null; visits: bigint; total_ms: number | null; avg_ms: number | null }[]
    >(
      `SELECT root AS path,
              COUNT(*) AS visits,
              COALESCE(SUM(durationMs), 0) AS total_ms,
              COALESCE(AVG(durationMs), 0) AS avg_ms
       FROM (
         SELECT
           CASE
             WHEN path IS NULL THEN NULL
             WHEN path LIKE '/%/%' THEN substr(path, 1, instr(substr(path,2),'/'))
             ELSE path
           END AS root,
           durationMs
         FROM "UxEvent"
         WHERE eventName = 'page_visit' AND createdAt >= ? ${exclUx}
       )
       GROUP BY root
       ORDER BY total_ms DESC
       LIMIT 25`,
      since,
    );

    // ─── Top búsquedas ─────────────────────────────────────────────────────
    // Las queries vienen en `props` como JSON. SQLite tiene `json_extract`.
    const searchRows = await prisma.$queryRawUnsafe<
      { query: string; n: bigint; avg_results: number | null }[]
    >(
      `SELECT
         json_extract(props, '$.query') AS query,
         COUNT(*) AS n,
         AVG(CAST(json_extract(props, '$.n_results') AS INTEGER)) AS avg_results
       FROM "UxEvent"
       WHERE eventName = 'search_query' AND createdAt >= ? ${exclUx}
       GROUP BY query
       ORDER BY n DESC
       LIMIT 15`,
      since,
    );

    // ─── Errores cliente agrupados ─────────────────────────────────────────
    const errorRows = await prisma.$queryRawUnsafe<
      { message: string | null; n: bigint; last_at: string }[]
    >(
      `SELECT
         json_extract(props, '$.message') AS message,
         COUNT(*) AS n,
         MAX(createdAt) AS last_at
       FROM "UxEvent"
       WHERE eventName = 'client_error' AND createdAt >= ? ${exclUx}
       GROUP BY message
       ORDER BY n DESC
       LIMIT 20`,
      since,
    );

    // ─── Funnels por flujo ─────────────────────────────────────────────────
    // Detectamos pares open/complete/abandon (prefijos comunes).
    const funnelRows = await prisma.$queryRawUnsafe<
      {
        flow: string;
        opens: bigint;
        completes: bigint;
        abandons: bigint;
        avg_complete_ms: number | null;
      }[]
    >(
      `WITH e AS (
         SELECT
           CASE
             WHEN eventName LIKE '%_open' THEN substr(eventName, 1, length(eventName)-5)
             WHEN eventName LIKE '%_complete' THEN substr(eventName, 1, length(eventName)-9)
             WHEN eventName LIKE '%_abandon' THEN substr(eventName, 1, length(eventName)-8)
             ELSE NULL
           END AS flow,
           eventName,
           durationMs
         FROM "UxEvent"
         WHERE createdAt >= ?
           AND (eventName LIKE '%_open' OR eventName LIKE '%_complete' OR eventName LIKE '%_abandon')
           ${exclUx}
       )
       SELECT
         flow,
         SUM(CASE WHEN eventName LIKE '%_open' THEN 1 ELSE 0 END) AS opens,
         SUM(CASE WHEN eventName LIKE '%_complete' THEN 1 ELSE 0 END) AS completes,
         SUM(CASE WHEN eventName LIKE '%_abandon' THEN 1 ELSE 0 END) AS abandons,
         AVG(CASE WHEN eventName LIKE '%_complete' AND durationMs IS NOT NULL THEN durationMs END) AS avg_complete_ms
       FROM e
       WHERE flow IS NOT NULL
       GROUP BY flow
       ORDER BY opens DESC`,
      since,
    );

    // ─── Tiempo medio de creación de ticket por usuario ────────────────────
    // Cogemos durationMs de los `ticket_create_complete` agrupados por user.
    const ticketCreatorsRaw = await prisma.$queryRawUnsafe<
      { userId: string | null; name: string | null; durations: string }[]
    >(
      `SELECT u.id AS userId, u.name AS name, group_concat(e.durationMs, ',') AS durations
       FROM "UxEvent" e
       LEFT JOIN "User" u ON u.id = e.userId
       WHERE e.eventName = 'ticket_create_complete'
         AND e.createdAt >= ?
         AND e.durationMs IS NOT NULL
         ${exclUx.replace(/\buserId\b/g, "e.userId")}
       GROUP BY u.id, u.name
       ORDER BY COUNT(*) DESC
       LIMIT 30`,
      since,
    );
    const ticket_create_by_user = ticketCreatorsRaw.map((r) => {
      const arr = (r.durations ?? "").split(",").map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
      const avg = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
      return {
        userId: r.userId,
        name: r.name,
        completes: arr.length,
        avg_ms: avg,
        median_ms: median(arr),
      };
    });

    // ─── Por turno ────────────────────────────────────────────────────────
    const byShiftRows = await prisma.$queryRawUnsafe<
      { shift: string | null; events: bigint; visits: bigint; creates: bigint }[]
    >(
      `SELECT
         COALESCE(shift, '?') AS shift,
         COUNT(*) AS events,
         SUM(CASE WHEN eventName = 'page_visit' THEN 1 ELSE 0 END) AS visits,
         SUM(CASE WHEN eventName = 'ticket_create_complete' THEN 1 ELSE 0 END) AS creates
       FROM "UxEvent"
       WHERE createdAt >= ? ${exclUx}
       GROUP BY shift
       ORDER BY CASE shift WHEN 'M' THEN 1 WHEN 'T' THEN 2 WHEN 'N' THEN 3 ELSE 4 END`,
      since,
    );

    // ─── Ranking de productividad ──────────────────────────────────────────
    // Combinamos:
    //   - tickets creados (de la tabla Ticket por createdById si existe, si no
    //     contamos eventos `ticket_create_complete`).
    //   - tickets resueltos (de Ticket.status='resuelto' con resolvedAt en
    //     rango, asignados al usuario).
    //   - page_visits del usuario.
    //   - "active minutes" aproximado: suma de durationMs de page_visit / 60_000.
    const rankingRaw = await prisma.$queryRawUnsafe<
      {
        userId: string;
        name: string;
        role: string | null;
        tickets_created: bigint;
        page_visits: bigint;
        active_seconds: number | null;
      }[]
    >(
      `SELECT
         u.id AS userId,
         u.name AS name,
         u.role AS role,
         (SELECT COUNT(*) FROM "UxEvent" WHERE userId = u.id AND eventName = 'ticket_create_complete' AND createdAt >= ?) AS tickets_created,
         (SELECT COUNT(*) FROM "UxEvent" WHERE userId = u.id AND eventName = 'page_visit' AND createdAt >= ?) AS page_visits,
         (SELECT COALESCE(SUM(durationMs), 0)/1000.0 FROM "UxEvent" WHERE userId = u.id AND eventName = 'page_visit' AND createdAt >= ?) AS active_seconds
       FROM "User" u
       WHERE u.isActive = 1 ${exclUser}
       ORDER BY tickets_created DESC, page_visits DESC
       LIMIT 25`,
      since,
      since,
      since,
    );
    // Tickets resueltos: de la tabla Ticket (estado real, no telemetría)
    const resolvedRows = await prisma.$queryRawUnsafe<
      { userId: string | null; n: bigint }[]
    >(
      `SELECT assignedToUserId AS userId, COUNT(*) AS n
       FROM "Ticket"
       WHERE status = 'resuelto' AND updatedAt >= ? ${exclAssign}
       GROUP BY assignedToUserId`,
      since,
    );
    const resolvedByUser = new Map<string, number>();
    for (const r of resolvedRows) {
      if (r.userId) resolvedByUser.set(r.userId, Number(r.n));
    }
    const ranking = rankingRaw
      .map((r) => ({
        userId: r.userId,
        name: r.name,
        role: r.role,
        tickets_created: Number(r.tickets_created),
        tickets_resolved: resolvedByUser.get(r.userId) ?? 0,
        page_visits: Number(r.page_visits),
        active_minutes: Math.round((r.active_seconds ?? 0) / 60),
      }))
      .filter((r) => r.tickets_created > 0 || r.tickets_resolved > 0 || r.page_visits > 0)
      .sort(
        (a, b) =>
          b.tickets_resolved + b.tickets_created * 0.5 -
          (a.tickets_resolved + a.tickets_created * 0.5),
      );

    // ─── Usuarios activos ──────────────────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayRow = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(DISTINCT userId) AS n FROM "UxEvent" WHERE createdAt >= ? AND userId IS NOT NULL ${exclUx}`,
      today.toISOString(),
    );
    const weekRow = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(DISTINCT userId) AS n FROM "UxEvent" WHERE createdAt >= ? AND userId IS NOT NULL ${exclUx}`,
      weekAgo.toISOString(),
    );

    // ─── Totales ───────────────────────────────────────────────────────────
    const totalsRow = await prisma.$queryRawUnsafe<
      { events: bigint; sessions: bigint }[]
    >(
      `SELECT COUNT(*) AS events, COUNT(DISTINCT sessionId) AS sessions
       FROM "UxEvent"
       WHERE createdAt >= ? ${exclUx}`,
      since,
    );

    // ─── Periodo anterior (deltas) ─────────────────────────────────────────
    // Se calculan solo unas pocas magnitudes "headline" para el hero.
    const [prevTotalsRow] = await prisma.$queryRawUnsafe<
      { events: bigint; sessions: bigint }[]
    >(
      `SELECT COUNT(*) AS events, COUNT(DISTINCT sessionId) AS sessions
       FROM "UxEvent"
       WHERE createdAt >= ? AND createdAt < ? ${exclUx}`,
      prevSince,
      prevUntil,
    );
    const [prevTicketsRow] = await prisma.$queryRawUnsafe<
      { resolved: bigint; created: bigint }[]
    >(
      `SELECT
         SUM(CASE WHEN status='resuelto' AND updatedAt >= ? AND updatedAt < ? THEN 1 ELSE 0 END) AS resolved,
         SUM(CASE WHEN createdAt >= ? AND createdAt < ? THEN 1 ELSE 0 END) AS created
       FROM "Ticket"
       WHERE createdAt >= ? OR updatedAt >= ?`,
      prevSince,
      prevUntil,
      prevSince,
      prevUntil,
      prevSince,
      prevSince,
    );
    const currentTicketsRow = await prisma.$queryRawUnsafe<
      { resolved: bigint; created: bigint; open: bigint }[]
    >(
      `SELECT
         SUM(CASE WHEN status='resuelto' AND updatedAt >= ? THEN 1 ELSE 0 END) AS resolved,
         SUM(CASE WHEN createdAt >= ? THEN 1 ELSE 0 END) AS created,
         SUM(CASE WHEN status IN ('abierto','en_proceso','esperando_repuesto') THEN 1 ELSE 0 END) AS open
       FROM "Ticket"
       WHERE createdAt >= ? OR status IN ('abierto','en_proceso','esperando_repuesto')`,
      since,
      since,
      since,
    );

    // ─── Heatmap día × hora ────────────────────────────────────────────────
    // SQLite: strftime('%w', ...) = 0..6 (Dom..Sáb), '%H' = 00..23.
    const heatmapRows = await prisma.$queryRawUnsafe<
      { dow: string | null; hour: string | null; n: bigint }[]
    >(
      `SELECT strftime('%w', createdAt) AS dow,
              strftime('%H', createdAt) AS hour,
              COUNT(*) AS n
       FROM "UxEvent"
       WHERE createdAt >= ? ${exclUx}
       GROUP BY dow, hour`,
      since,
    );
    const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of heatmapRows) {
      const d = Number(r.dow ?? 0);
      const h = Number(r.hour ?? 0);
      if (d >= 0 && d < 7 && h >= 0 && h < 24) {
        heatmap[d][h] = Number(r.n);
      }
    }

    // ─── Timeseries (eventos por día) ──────────────────────────────────────
    const tsRows = await prisma.$queryRawUnsafe<
      { day: string; events: bigint; visits: bigint; creates: bigint }[]
    >(
      `SELECT
         date(createdAt) AS day,
         COUNT(*) AS events,
         SUM(CASE WHEN eventName = 'page_visit' THEN 1 ELSE 0 END) AS visits,
         SUM(CASE WHEN eventName IN ('ticket_create_complete','ticket_created') THEN 1 ELSE 0 END) AS creates
       FROM "UxEvent"
       WHERE createdAt >= ? ${exclUx}
       GROUP BY day
       ORDER BY day`,
      since,
    );
    const tsMap = new Map<string, { events: number; visits: number; creates: number }>();
    for (const r of tsRows) {
      tsMap.set(r.day, {
        events: Number(r.events),
        visits: Number(r.visits),
        creates: Number(r.creates),
      });
    }
    // Rellena los días sin eventos para tener la serie continua.
    const timeseries: SummaryRow["timeseries"] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const entry = tsMap.get(key);
      timeseries.push({
        date: key,
        events: entry?.events ?? 0,
        visits: entry?.visits ?? 0,
        creates: entry?.creates ?? 0,
      });
    }

    // ─── Errores de API agregados ──────────────────────────────────────────
    const apiErrorRows = await prisma.$queryRawUnsafe<
      {
        path: string | null;
        status: number | null;
        n: bigint;
        avg_ms: number | null;
        last_at: string;
      }[]
    >(
      `SELECT
         json_extract(props, '$.path') AS path,
         CAST(json_extract(props, '$.status') AS INTEGER) AS status,
         COUNT(*) AS n,
         AVG(durationMs) AS avg_ms,
         MAX(createdAt) AS last_at
       FROM "UxEvent"
       WHERE eventName = 'api_error' AND createdAt >= ? ${exclUx}
       GROUP BY path, status
       ORDER BY n DESC
       LIMIT 25`,
      since,
    );

    // ─── Segmentación por rol ──────────────────────────────────────────────
    const byRoleRows = await prisma.$queryRawUnsafe<
      { role: string | null; events: bigint; users: bigint }[]
    >(
      `SELECT
         COALESCE(userRole, '(sin rol)') AS role,
         COUNT(*) AS events,
         COUNT(DISTINCT userId) AS users
       FROM "UxEvent"
       WHERE createdAt >= ? ${exclUx}
       GROUP BY userRole
       ORDER BY events DESC`,
      since,
    );

    // ─── Métricas REALES de tickets (no telemetría) ────────────────────────
    // MTTR (mean / median) y % SLA cumplido. Se calcula sobre los tickets
    // RESUELTOS en el rango. Sin tablas extra, datos directos de Ticket.
    const ticketResolutionRows = await prisma.$queryRawUnsafe<
      { duration_min: number; sla_met: number }[]
    >(
      `SELECT
         CAST((julianday(updatedAt) - julianday(createdAt)) * 24 * 60 AS INTEGER) AS duration_min,
         CASE WHEN updatedAt <= slaDeadline THEN 1 ELSE 0 END AS sla_met
       FROM "Ticket"
       WHERE status = 'resuelto' AND updatedAt >= ?`,
      since,
    );
    const durations = ticketResolutionRows
      .map((r) => Number(r.duration_min))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const mttrMinutes = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
    const medianResolutionMinutes = median(durations);
    const slaMet = ticketResolutionRows.reduce((acc, r) => acc + Number(r.sla_met), 0);
    const slaTotal = ticketResolutionRows.length;
    const slaBreached = slaTotal - slaMet;

    // Tickets por prioridad (creados / resueltos)
    const byPriorityRows = await prisma.$queryRawUnsafe<
      { priority: string; n: bigint; resolved: bigint }[]
    >(
      `SELECT
         priority,
         COUNT(*) AS n,
         SUM(CASE WHEN status='resuelto' THEN 1 ELSE 0 END) AS resolved
       FROM "Ticket"
       WHERE createdAt >= ?
       GROUP BY priority
       ORDER BY n DESC`,
      since,
    );

    // Top buses con más tickets en el rango
    const topBusesRows = await prisma.$queryRawUnsafe<{ busId: string; n: bigint }[]>(
      `SELECT busId, COUNT(*) AS n
       FROM "Ticket"
       WHERE createdAt >= ?
       GROUP BY busId
       ORDER BY n DESC
       LIMIT 10`,
      since,
    );

    // Helper para calcular delta porcentual.
    const pctDelta = (now_: number, prev: number): number | null => {
      if (prev === 0 && now_ === 0) return 0;
      if (prev === 0) return null; // "nuevo" — no se puede calcular %
      return Math.round(((now_ - prev) / prev) * 1000) / 10; // 1 decimal
    };

    const currentEvents = Number(totalsRow[0]?.events ?? 0);
    const currentSessions = Number(totalsRow[0]?.sessions ?? 0);
    const prevEvents = Number(prevTotalsRow?.events ?? 0);
    const prevSessions = Number(prevTotalsRow?.sessions ?? 0);
    const currentResolved = Number(currentTicketsRow[0]?.resolved ?? 0);
    const currentCreated = Number(currentTicketsRow[0]?.created ?? 0);
    const currentOpen = Number(currentTicketsRow[0]?.open ?? 0);
    const prevResolved = Number(prevTicketsRow?.resolved ?? 0);
    const prevCreated = Number(prevTicketsRow?.created ?? 0);

    const summary: SummaryRow = {
      page_visits: pageRows.map((r) => ({
        path: r.path,
        visits: Number(r.visits),
        total_ms: Number(r.total_ms ?? 0),
        avg_ms: Math.round(Number(r.avg_ms ?? 0)),
      })),
      top_searches: searchRows.map((r) => ({
        query: r.query ?? "",
        n: Number(r.n),
        avg_results: Math.round(Number(r.avg_results ?? 0)),
      })),
      errors: errorRows.map((r) => ({
        message: r.message ?? "(sin mensaje)",
        n: Number(r.n),
        last_at: r.last_at,
      })),
      funnels: funnelRows.map((r) => ({
        flow: r.flow,
        opens: Number(r.opens),
        completes: Number(r.completes),
        abandons: Number(r.abandons),
        avg_complete_ms: Math.round(Number(r.avg_complete_ms ?? 0)),
      })),
      ticket_create_by_user,
      by_shift: byShiftRows.map((r) => ({
        shift: r.shift ?? "?",
        events: Number(r.events),
        visits: Number(r.visits),
        creates: Number(r.creates),
      })),
      ranking,
      active_users: {
        today: Number(todayRow[0]?.n ?? 0),
        week: Number(weekRow[0]?.n ?? 0),
      },
      totals: {
        events: currentEvents,
        sessions: currentSessions,
        events_prev: prevEvents,
        sessions_prev: prevSessions,
      },
      heatmap,
      timeseries,
      api_errors: apiErrorRows.map((r) => ({
        path: r.path ?? "(desconocido)",
        status: Number(r.status ?? 0),
        n: Number(r.n),
        avg_ms: Math.round(Number(r.avg_ms ?? 0)),
        last_at: r.last_at,
      })),
      by_role: byRoleRows.map((r) => ({
        role: r.role ?? "(sin rol)",
        events: Number(r.events),
        users: Number(r.users),
      })),
      tickets: {
        created: currentCreated,
        resolved: currentResolved,
        open: currentOpen,
        sla_breached: slaBreached,
        sla_total: slaTotal,
        mttr_minutes: mttrMinutes,
        median_resolution_minutes: medianResolutionMinutes,
        by_priority: byPriorityRows.map((r) => ({
          priority: r.priority,
          n: Number(r.n),
          resolved: Number(r.resolved),
        })),
        top_buses: topBusesRows.map((r) => ({
          busId: r.busId,
          n: Number(r.n),
        })),
      },
      trends: {
        events: { value: currentEvents, prev: prevEvents, delta_pct: pctDelta(currentEvents, prevEvents) },
        sessions: { value: currentSessions, prev: prevSessions, delta_pct: pctDelta(currentSessions, prevSessions) },
        tickets_resolved: { value: currentResolved, prev: prevResolved, delta_pct: pctDelta(currentResolved, prevResolved) },
        tickets_created: { value: currentCreated, prev: prevCreated, delta_pct: pctDelta(currentCreated, prevCreated) },
      },
    };

    return NextResponse.json({ days, summary });
  } catch (error) {
    console.error("analytics summary error:", error);
    return NextResponse.json({ message: "Error generando resumen" }, { status: 500 });
  }
}
