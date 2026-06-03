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
    /** Nº de tickets creados (fuente: AuditEvent). */
    completes: number;
    avg_ms: number;
    median_ms: number;
    /** Nº de muestras con tiempo medido (telemetría UX). 0 = sin datos de tiempo. */
    timed_samples: number;
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
    /** MTTR (mediana) en minutos, desglosado por prioridad. */
    mttr_by_priority: { priority: string; median_minutes: number; samples: number }[];
    /** Mayor "exceso" sobre el SLA entre los breaches del rango (en minutos). */
    worst_sla_overrun_minutes: number;
    top_buses: { busId: string; n: number }[];
  };
  /**
   * Drill-down de incidencias por flota: agrupado por bus (todos, no solo top
   * 10), por línea operativa y por operador. Permite responder "¿qué linea
   * acumula más averías?" o "¿qué operador da peor?".
   */
  fleet: {
    by_bus: {
      busId: string;
      operator: string | null;
      municipio: string | null;
      total: number;
      resolved: number;
      open: number;
      sla_breached: number;
    }[];
    by_linea: { linea: string; total: number; resolved: number; open: number; buses: number }[];
    by_operator: {
      operator: string;
      total: number;
      resolved: number;
      open: number;
      buses: number;
    }[];
  };
  /**
   * Tiempo medio que un ticket pasa EN cada estado antes de salir a otro.
   * Reconstruido a partir de `AuditEvent` (acción 'ticket.status_changed' +
   * 'ticket.created'). Permite ver dónde se atascan los tickets.
   */
  state_durations: {
    state: string;
    avg_minutes: number;
    median_minutes: number;
    samples: number;
  }[];
  /**
   * Responsividad del equipo: tiempo desde que se asigna un ticket hasta el
   * primer cambio de estado posterior (cualquier acción). Se calcula global,
   * por técnico asignado y mediana/promedio.
   */
  response_time: {
    avg_minutes: number;
    median_minutes: number;
    samples: number;
    by_user: {
      userId: string;
      name: string | null;
      avg_minutes: number;
      median_minutes: number;
      samples: number;
    }[];
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

/** Orden canónico de prioridad para mostrarlas siempre igual. */
function priorityOrder(p: string): number {
  switch (p) {
    case "critica": return 0;
    case "alta": return 1;
    case "media": return 2;
    case "baja": return 3;
    default: return 4;
  }
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
     * IMPORTANTE: SQLite guarda DateTime de forma heterogénea según cómo
     * se creó la tabla:
     *   - `UxEvent.createdAt`        → TEXT (ISO 8601)
     *   - `Ticket.createdAt`         → INTEGER (epoch ms)
     *   - `AuditEvent.createdAt`     → INTEGER (epoch ms)
     *   - `User.createdAt`           → INTEGER (epoch ms)
     *
     * Si pasas un ISO string al WHERE de una columna integer, la comparación
     * silenciosamente devuelve 0 filas. Por eso mantenemos dos variantes
     * del mismo "since" y usamos la correcta en cada query.
     */
    const sinceMs = now - days * 24 * 60 * 60 * 1000;
    /**
     * Periodo anterior del mismo tamaño, para calcular deltas. Si los días
     * son 7, comparamos esos 7 días vs los 7 anteriores; permite ver
     * tendencias sin requerir UI extra al usuario.
     */
    const prevSince = new Date(now - 2 * days * 24 * 60 * 60 * 1000).toISOString();
    const prevUntil = since;
    const prevSinceMs = now - 2 * days * 24 * 60 * 60 * 1000;
    const prevUntilMs = sinceMs;

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
    // FUENTE DE VERDAD: tabla AuditEvent (action='ticket.created') — captura
    // TODOS los tickets creados, no solo los que pasaron por el formulario con
    // telemetría. La telemetría UX (ticket_create_complete) la enriquecemos
    // como dato secundario para mostrar mediana/media del tiempo en formulario
    // cuando esté disponible.
    const creatorsRaw = await prisma.$queryRawUnsafe<
      { userId: string | null; name: string | null; n: bigint }[]
    >(
      `SELECT u.id AS userId, u.name AS name, COUNT(*) AS n
       FROM "AuditEvent" a
       LEFT JOIN "User" u ON u.id = a.userId
       WHERE a.action = 'ticket.created' AND a.createdAt >= ?
         ${exclUser.replace(/u\.id/g, "a.userId")}
       GROUP BY u.id, u.name
       ORDER BY n DESC
       LIMIT 30`,
      sinceMs,
    );
    // Mapeo paralelo: por usuario, durations de ticket_create_complete.
    const creatorTelemetryRaw = await prisma.$queryRawUnsafe<
      { userId: string | null; durations: string | null }[]
    >(
      `SELECT u.id AS userId, group_concat(e.durationMs, ',') AS durations
       FROM "UxEvent" e
       LEFT JOIN "User" u ON u.id = e.userId
       WHERE e.eventName = 'ticket_create_complete'
         AND e.createdAt >= ?
         AND e.durationMs IS NOT NULL
         ${exclUx.replace(/\buserId\b/g, "e.userId")}
       GROUP BY u.id`,
      since,
    );
    const telemetryByUser = new Map<
      string,
      { durations: number[]; avg_ms: number; median_ms: number }
    >();
    for (const row of creatorTelemetryRaw) {
      if (!row.userId) continue;
      const arr = (row.durations ?? "")
        .split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n));
      const avg = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
      telemetryByUser.set(row.userId, {
        durations: arr,
        avg_ms: avg,
        median_ms: median(arr),
      });
    }
    const ticket_create_by_user = creatorsRaw.map((r) => {
      const tel = r.userId ? telemetryByUser.get(r.userId) : undefined;
      return {
        userId: r.userId,
        name: r.name,
        completes: Number(r.n),
        // Si no hay telemetría, dejamos los tiempos a 0; el frontend mostrará
        // un guion en vez de valores falsos.
        avg_ms: tel?.avg_ms ?? 0,
        median_ms: tel?.median_ms ?? 0,
        /** Cuántos de los `completes` aportaron tiempo medible. */
        timed_samples: tel?.durations.length ?? 0,
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
      sinceMs,
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
      prevSinceMs,
      prevUntilMs,
      prevSinceMs,
      prevUntilMs,
      prevSinceMs,
      prevSinceMs,
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
      sinceMs,
      sinceMs,
      sinceMs,
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
    // Columnas createdAt/updatedAt/slaDeadline son INTEGER (epoch ms), por
    // eso restamos directo en ms y dividimos por 60000 para obtener minutos.
    const ticketResolutionRows = await prisma.$queryRawUnsafe<
      {
        duration_min: number;
        sla_met: number;
        priority: string;
        sla_overrun_min: number;
      }[]
    >(
      `SELECT
         CAST(((updatedAt - createdAt) / 60000.0) AS INTEGER) AS duration_min,
         CASE WHEN updatedAt <= slaDeadline THEN 1 ELSE 0 END AS sla_met,
         priority,
         CAST(((updatedAt - slaDeadline) / 60000.0) AS INTEGER) AS sla_overrun_min
       FROM "Ticket"
       WHERE status = 'resuelto' AND updatedAt >= ?`,
      sinceMs,
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
    /** Peor exceso sobre SLA entre los tickets que se pasaron de plazo. */
    const worstSlaOverrun = ticketResolutionRows
      .filter((r) => !Number(r.sla_met))
      .map((r) => Number(r.sla_overrun_min))
      .filter((n) => Number.isFinite(n) && n > 0)
      .reduce((max, n) => Math.max(max, n), 0);
    /** Mediana de MTTR agrupada por prioridad. Útil para ver si los críticos
     *  se resuelven más rápido (deberían). */
    const mttrByPriorityMap = new Map<string, number[]>();
    for (const r of ticketResolutionRows) {
      const arr = mttrByPriorityMap.get(r.priority) ?? [];
      const d = Number(r.duration_min);
      if (Number.isFinite(d) && d >= 0) arr.push(d);
      mttrByPriorityMap.set(r.priority, arr);
    }
    const mttrByPriority = Array.from(mttrByPriorityMap.entries())
      .map(([priority, arr]) => ({
        priority,
        median_minutes: median(arr),
        samples: arr.length,
      }))
      .sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));

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
      sinceMs,
    );

    // Top buses con más tickets en el rango
    const topBusesRows = await prisma.$queryRawUnsafe<{ busId: string; n: bigint }[]>(
      `SELECT busId, COUNT(*) AS n
       FROM "Ticket"
       WHERE createdAt >= ?
       GROUP BY busId
       ORDER BY n DESC
       LIMIT 10`,
      sinceMs,
    );

    // ─── Drill-down por flota: bus / línea / operador ─────────────────────
    // Un sola query que mete todos los tickets del rango con metadatos del bus.
    // Luego agregamos en JS para evitar tres SELECT distintos.
    type FleetTicketRow = {
      busId: string;
      operator: string | null;
      municipio: string | null;
      lineaLabel: string | null;
      busLineas: string | null;
      status: string;
      slaDeadline: string;
      updatedAt: string;
    };
    const fleetTicketRows = await prisma.$queryRawUnsafe<FleetTicketRow[]>(
      `SELECT
         t.busId AS busId,
         b.operator AS operator,
         b.municipio AS municipio,
         t.lineaLabel AS lineaLabel,
         b.lineas AS busLineas,
         t.status AS status,
         t.slaDeadline AS slaDeadline,
         t.updatedAt AS updatedAt
       FROM "Ticket" t
       LEFT JOIN "Bus" b ON b.id = t.busId
       WHERE t.createdAt >= ?`,
      sinceMs,
    );
    type AggRow = {
      total: number;
      resolved: number;
      open: number;
      sla_breached: number;
      buses: Set<string>;
    };
    const byBusMap = new Map<
      string,
      { operator: string | null; municipio: string | null } & AggRow
    >();
    const byLineaMap = new Map<string, AggRow>();
    const byOperatorMap = new Map<string, AggRow>();
    const openStates = new Set(["abierto", "en_proceso", "esperando_repuesto"]);
    /**
     * Normaliza un timestamp que puede venir como número (epoch ms) o como
     * string ISO (depende de la columna SQLite). Devuelve milisegundos.
     */
    const toMs = (v: unknown): number => {
      if (typeof v === "number") return v;
      if (typeof v === "bigint") return Number(v);
      if (typeof v === "string") return new Date(v).getTime();
      if (v instanceof Date) return v.getTime();
      return 0;
    };
    const nowMs = Date.now();
    for (const t of fleetTicketRows) {
      const isResolved = t.status === "resuelto";
      const isOpen = openStates.has(t.status);
      const slaMs = toMs(t.slaDeadline);
      const closedMs = toMs(t.updatedAt);
      const slaBreached =
        isResolved && closedMs > slaMs
          ? 1
          : !isResolved && nowMs > slaMs
            ? 1
            : 0;

      // Bus
      const bus = byBusMap.get(t.busId) ?? {
        operator: t.operator,
        municipio: t.municipio,
        total: 0,
        resolved: 0,
        open: 0,
        sla_breached: 0,
        buses: new Set<string>(),
      };
      bus.total++;
      if (isResolved) bus.resolved++;
      if (isOpen) bus.open++;
      bus.sla_breached += slaBreached;
      byBusMap.set(t.busId, bus);

      // Líneas: preferimos lineaLabel del ticket; si no, las del bus (CSV).
      const lineas = (() => {
        if (t.lineaLabel && t.lineaLabel.trim()) return [t.lineaLabel.trim()];
        if (!t.busLineas) return ["(sin línea)"];
        return t.busLineas
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      })();
      for (const linea of lineas) {
        const agg = byLineaMap.get(linea) ?? {
          total: 0,
          resolved: 0,
          open: 0,
          sla_breached: 0,
          buses: new Set<string>(),
        };
        agg.total++;
        if (isResolved) agg.resolved++;
        if (isOpen) agg.open++;
        agg.sla_breached += slaBreached;
        agg.buses.add(t.busId);
        byLineaMap.set(linea, agg);
      }

      // Operador
      const op = t.operator?.trim() || "(sin operador)";
      const opAgg = byOperatorMap.get(op) ?? {
        total: 0,
        resolved: 0,
        open: 0,
        sla_breached: 0,
        buses: new Set<string>(),
      };
      opAgg.total++;
      if (isResolved) opAgg.resolved++;
      if (isOpen) opAgg.open++;
      opAgg.sla_breached += slaBreached;
      opAgg.buses.add(t.busId);
      byOperatorMap.set(op, opAgg);
    }
    const byBus = Array.from(byBusMap.entries())
      .map(([busId, v]) => ({
        busId,
        operator: v.operator,
        municipio: v.municipio,
        total: v.total,
        resolved: v.resolved,
        open: v.open,
        sla_breached: v.sla_breached,
      }))
      .sort((a, b) => b.total - a.total);
    const byLinea = Array.from(byLineaMap.entries())
      .map(([linea, v]) => ({
        linea,
        total: v.total,
        resolved: v.resolved,
        open: v.open,
        buses: v.buses.size,
      }))
      .sort((a, b) => b.total - a.total);
    const byOperator = Array.from(byOperatorMap.entries())
      .map(([operator, v]) => ({
        operator,
        total: v.total,
        resolved: v.resolved,
        open: v.open,
        buses: v.buses.size,
      }))
      .sort((a, b) => b.total - a.total);

    // ─── Tiempo medio EN cada estado ───────────────────────────────────────
    // Reconstruimos el ciclo de vida de cada ticket leyendo AuditEvent en
    // orden temporal y parseando los detail "from -> to". Para cada estado,
    // acumulamos cuánto tiempo pasó el ticket dentro antes de salir.
    type AuditRow = {
      ticketId: string;
      action: string;
      detail: string | null;
      createdAt: string;
    };
    const auditRows = await prisma.$queryRawUnsafe<AuditRow[]>(
      `SELECT ticketId, action, detail, createdAt
       FROM "AuditEvent"
       WHERE ticketId IS NOT NULL
         AND action IN ('ticket.created', 'ticket.status_changed', 'ticket.assigned')
         AND createdAt >= ?
       ORDER BY ticketId, createdAt ASC`,
      sinceMs,
    );

    /** Por estado, array de duraciones en minutos. */
    const stateDurations = new Map<string, number[]>();
    /** Por ticket, array de pares (asignación → siguiente cambio) en minutos. */
    const responseSamples: { userId: string; minutes: number }[] = [];

    let currentTicketId: string | null = null;
    let currentState: string | null = null;
    let stateEnteredAt: number | null = null;
    let pendingAssignAt: number | null = null;
    let pendingAssignUserId: string | null = null;

    const transitionRegex = /^(\w+)\s*->\s*(\w+)/;

    /**
     * Mapa userId→displayName para enriquecer las muestras de responsividad.
     * Lo cargamos al final con los IDs que efectivamente aparecen.
     */
    const responseUserIds = new Set<string>();

    const flushTicket = () => {
      currentState = null;
      stateEnteredAt = null;
      pendingAssignAt = null;
      pendingAssignUserId = null;
    };

    for (const row of auditRows) {
      if (row.ticketId !== currentTicketId) {
        flushTicket();
        currentTicketId = row.ticketId;
      }
      const ts = toMs(row.createdAt);

      if (row.action === "ticket.created") {
        currentState = "abierto";
        stateEnteredAt = ts;
        continue;
      }
      if (row.action === "ticket.status_changed") {
        const m = row.detail?.match(transitionRegex);
        if (!m) continue;
        const from = m[1];
        const to = m[2];
        // Acumular duración del estado saliente.
        if (currentState && stateEnteredAt) {
          const minutes = (ts - stateEnteredAt) / 60_000;
          if (minutes >= 0 && minutes < 60 * 24 * 365) {
            const arr = stateDurations.get(currentState) ?? [];
            arr.push(minutes);
            stateDurations.set(currentState, arr);
          }
        }
        currentState = to;
        stateEnteredAt = ts;

        // Responsividad: si había una asignación pendiente, este es el primer
        // cambio post-asignación.
        if (pendingAssignAt && pendingAssignUserId) {
          const minutes = (ts - pendingAssignAt) / 60_000;
          if (minutes >= 0 && minutes < 60 * 24 * 14) {
            responseSamples.push({ userId: pendingAssignUserId, minutes });
            responseUserIds.add(pendingAssignUserId);
          }
          pendingAssignAt = null;
          pendingAssignUserId = null;
        }
        // De `abierto` → `resuelto` directo también cuenta como primera acción
        // del creador, pero ahí no hay assignee, así que no lo metemos.
        continue;
      }
      if (row.action === "ticket.assigned") {
        // El detail tiene formato "X asignó ticket a Y". Si "a nadie" → desasign.
        // No tenemos el userId del assignee fácil, pero podemos extraerlo del
        // AuditEvent.userId (= quien hizo la asignación). Como simplificación:
        // tomamos al actor como responsable de la siguiente respuesta — útil
        // para "self-assigned", que es el caso más frecuente en campo.
        if (row.detail && !/asign[oó]\s+ticket\s+a\s+nadie/i.test(row.detail)) {
          // No tenemos columna userId aquí; haremos lookup ligero al actor de
          // este AuditEvent abajo, en una query enriquecida.
          pendingAssignAt = ts;
          pendingAssignUserId = "__pending__"; // marcador, se resuelve abajo
        }
        continue;
      }
    }

    // Si tenemos marcadores __pending__, resolvemos el userId real con un
    // segundo SELECT (solo los assigned que tuvieron respuesta).
    if (responseSamples.some((s) => s.userId === "__pending__")) {
      // Para simplificar el matching, recalculamos con userIds reales.
      // Volvemos a leer audit events INCLUYENDO userId.
      type AuditRow2 = AuditRow & { userId: string | null };
      const auditRowsWithUser = await prisma.$queryRawUnsafe<AuditRow2[]>(
        `SELECT userId, ticketId, action, detail, createdAt
         FROM "AuditEvent"
         WHERE ticketId IS NOT NULL
           AND action IN ('ticket.created', 'ticket.status_changed', 'ticket.assigned')
           AND createdAt >= ?
         ORDER BY ticketId, createdAt ASC`,
        sinceMs,
      );
      // Rehacer la pasada con userId
      responseSamples.length = 0;
      responseUserIds.clear();
      let tId: string | null = null;
      let pAt: number | null = null;
      let pUid: string | null = null;
      for (const r of auditRowsWithUser) {
        if (r.ticketId !== tId) {
          tId = r.ticketId;
          pAt = null;
          pUid = null;
        }
        const ts2 = toMs(r.createdAt);
        if (r.action === "ticket.assigned") {
          if (r.detail && !/asign[oó]\s+ticket\s+a\s+nadie/i.test(r.detail)) {
            pAt = ts2;
            pUid = r.userId;
          }
          continue;
        }
        if (r.action === "ticket.status_changed" && pAt && pUid) {
          const minutes = (ts2 - pAt) / 60_000;
          if (minutes >= 0 && minutes < 60 * 24 * 14) {
            responseSamples.push({ userId: pUid, minutes });
            responseUserIds.add(pUid);
          }
          pAt = null;
          pUid = null;
        }
      }
    }

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const stateDurationsArr = Array.from(stateDurations.entries())
      .map(([state, arr]) => ({
        state,
        avg_minutes: Math.round(avg(arr)),
        median_minutes: Math.round(median(arr)),
        samples: arr.length,
      }))
      .sort((a, b) => b.samples - a.samples);

    // Agregar response_time global + por usuario.
    const responseUsers = new Map<string, number[]>();
    for (const s of responseSamples) {
      const arr = responseUsers.get(s.userId) ?? [];
      arr.push(s.minutes);
      responseUsers.set(s.userId, arr);
    }
    let responseNames = new Map<string, string>();
    if (responseUserIds.size > 0) {
      const ids = Array.from(responseUserIds);
      const placeholders = ids.map(() => "?").join(",");
      const userRows = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
        `SELECT id, name FROM "User" WHERE id IN (${placeholders})`,
        ...ids,
      );
      responseNames = new Map(userRows.map((u) => [u.id, u.name]));
    }
    const responseByUser = Array.from(responseUsers.entries())
      .map(([userId, arr]) => ({
        userId,
        name: responseNames.get(userId) ?? null,
        avg_minutes: Math.round(avg(arr)),
        median_minutes: Math.round(median(arr)),
        samples: arr.length,
      }))
      .sort((a, b) => a.median_minutes - b.median_minutes);
    const allResponseTimes = responseSamples.map((s) => s.minutes);

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
        mttr_by_priority: mttrByPriority,
        worst_sla_overrun_minutes: worstSlaOverrun,
        top_buses: topBusesRows.map((r) => ({
          busId: r.busId,
          n: Number(r.n),
        })),
      },
      fleet: {
        by_bus: byBus,
        by_linea: byLinea,
        by_operator: byOperator,
      },
      state_durations: stateDurationsArr,
      response_time: {
        avg_minutes: Math.round(avg(allResponseTimes)),
        median_minutes: Math.round(median(allResponseTimes)),
        samples: allResponseTimes.length,
        by_user: responseByUser,
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
