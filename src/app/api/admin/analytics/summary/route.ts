import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/rbac";

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
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

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
         WHERE eventName = 'page_visit' AND createdAt >= ?
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
       WHERE eventName = 'search_query' AND createdAt >= ?
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
       WHERE eventName = 'client_error' AND createdAt >= ?
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
       WHERE createdAt >= ?
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
        tickets_created: bigint;
        page_visits: bigint;
        active_seconds: number | null;
      }[]
    >(
      `SELECT
         u.id AS userId,
         u.name AS name,
         (SELECT COUNT(*) FROM "UxEvent" WHERE userId = u.id AND eventName = 'ticket_create_complete' AND createdAt >= ?) AS tickets_created,
         (SELECT COUNT(*) FROM "UxEvent" WHERE userId = u.id AND eventName = 'page_visit' AND createdAt >= ?) AS page_visits,
         (SELECT COALESCE(SUM(durationMs), 0)/1000.0 FROM "UxEvent" WHERE userId = u.id AND eventName = 'page_visit' AND createdAt >= ?) AS active_seconds
       FROM "User" u
       WHERE u.isActive = 1
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
       WHERE status = 'resuelto' AND updatedAt >= ?
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
      `SELECT COUNT(DISTINCT userId) AS n FROM "UxEvent" WHERE createdAt >= ? AND userId IS NOT NULL`,
      today.toISOString(),
    );
    const weekRow = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(DISTINCT userId) AS n FROM "UxEvent" WHERE createdAt >= ? AND userId IS NOT NULL`,
      weekAgo.toISOString(),
    );

    // ─── Totales ───────────────────────────────────────────────────────────
    const totalsRow = await prisma.$queryRawUnsafe<
      { events: bigint; sessions: bigint }[]
    >(
      `SELECT COUNT(*) AS events, COUNT(DISTINCT sessionId) AS sessions
       FROM "UxEvent"
       WHERE createdAt >= ?`,
      since,
    );

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
        events: Number(totalsRow[0]?.events ?? 0),
        sessions: Number(totalsRow[0]?.sessions ?? 0),
      },
    };

    return NextResponse.json({ days, summary });
  } catch (error) {
    console.error("analytics summary error:", error);
    return NextResponse.json({ message: "Error generando resumen" }, { status: 500 });
  }
}
