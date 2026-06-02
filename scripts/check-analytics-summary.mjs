// Llama a la misma lógica que /api/admin/analytics/summary contra la BD local
// y muestra el resultado para verificar que el endpoint devolverá datos OK.
//
// Es un calco simplificado del route para evitar montar Next.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const replacer = (_k, v) => (typeof v === "bigint" ? Number(v) : v);

function median(arr) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

async function run(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const page_visits = await prisma.$queryRawUnsafe(
    `SELECT root AS path, COUNT(*) AS visits, COALESCE(SUM(durationMs),0) AS total_ms, COALESCE(AVG(durationMs),0) AS avg_ms
     FROM (
       SELECT CASE
         WHEN path IS NULL THEN NULL
         WHEN path LIKE '/%/%' THEN substr(path, 1, instr(substr(path,2),'/'))
         ELSE path END AS root, durationMs
       FROM "UxEvent" WHERE eventName='page_visit' AND createdAt >= ?
     )
     GROUP BY root ORDER BY total_ms DESC LIMIT 10`, since);

  const top_searches = await prisma.$queryRawUnsafe(
    `SELECT json_extract(props,'$.query') AS query, COUNT(*) AS n,
            AVG(CAST(json_extract(props,'$.n_results') AS INTEGER)) AS avg_results
     FROM "UxEvent" WHERE eventName='search_query' AND createdAt >= ?
     GROUP BY query ORDER BY n DESC LIMIT 8`, since);

  const errors = await prisma.$queryRawUnsafe(
    `SELECT json_extract(props,'$.message') AS message, COUNT(*) AS n, MAX(createdAt) AS last_at
     FROM "UxEvent" WHERE eventName='client_error' AND createdAt >= ?
     GROUP BY message ORDER BY n DESC LIMIT 10`, since);

  const funnels = await prisma.$queryRawUnsafe(
    `WITH e AS (
       SELECT CASE
         WHEN eventName LIKE '%_open' THEN substr(eventName,1,length(eventName)-5)
         WHEN eventName LIKE '%_complete' THEN substr(eventName,1,length(eventName)-9)
         WHEN eventName LIKE '%_abandon' THEN substr(eventName,1,length(eventName)-8)
         ELSE NULL END AS flow, eventName, durationMs
       FROM "UxEvent"
       WHERE createdAt >= ? AND (eventName LIKE '%_open' OR eventName LIKE '%_complete' OR eventName LIKE '%_abandon'))
     SELECT flow,
       SUM(CASE WHEN eventName LIKE '%_open' THEN 1 ELSE 0 END) AS opens,
       SUM(CASE WHEN eventName LIKE '%_complete' THEN 1 ELSE 0 END) AS completes,
       SUM(CASE WHEN eventName LIKE '%_abandon' THEN 1 ELSE 0 END) AS abandons,
       AVG(CASE WHEN eventName LIKE '%_complete' AND durationMs IS NOT NULL THEN durationMs END) AS avg_complete_ms
     FROM e WHERE flow IS NOT NULL GROUP BY flow ORDER BY opens DESC`, since);

  const by_shift = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(shift,'?') AS shift, COUNT(*) AS events,
            SUM(CASE WHEN eventName='page_visit' THEN 1 ELSE 0 END) AS visits,
            SUM(CASE WHEN eventName='ticket_create_complete' THEN 1 ELSE 0 END) AS creates
     FROM "UxEvent" WHERE createdAt >= ?
     GROUP BY shift ORDER BY CASE shift WHEN 'M' THEN 1 WHEN 'T' THEN 2 WHEN 'N' THEN 3 ELSE 4 END`, since);

  const ticketCreators = await prisma.$queryRawUnsafe(
    `SELECT u.id AS userId, u.name AS name, group_concat(e.durationMs, ',') AS durations
     FROM "UxEvent" e LEFT JOIN "User" u ON u.id = e.userId
     WHERE e.eventName='ticket_create_complete' AND e.createdAt >= ? AND e.durationMs IS NOT NULL
     GROUP BY u.id, u.name ORDER BY COUNT(*) DESC LIMIT 10`, since);

  const totals = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS events, COUNT(DISTINCT sessionId) AS sessions FROM "UxEvent" WHERE createdAt >= ?`, since);

  const todayActive = await prisma.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT userId) AS n FROM "UxEvent"
     WHERE createdAt >= datetime('now','start of day') AND userId IS NOT NULL`);

  const weekActive = await prisma.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT userId) AS n FROM "UxEvent"
     WHERE createdAt >= datetime('now','-7 day') AND userId IS NOT NULL`);

  console.log("=== TOTALS ===");
  console.log(JSON.stringify(totals, replacer));
  console.log("Activos hoy:", JSON.stringify(todayActive, replacer), "última semana:", JSON.stringify(weekActive, replacer));

  console.log("\n=== TOP PATHS (top 10 por tiempo) ===");
  console.table(JSON.parse(JSON.stringify(page_visits, replacer)));

  console.log("\n=== FUNNELS ===");
  console.table(JSON.parse(JSON.stringify(funnels, replacer)));

  console.log("\n=== POR TURNO ===");
  console.table(JSON.parse(JSON.stringify(by_shift, replacer)));

  console.log("\n=== TIEMPO CREACIÓN POR USUARIO (mediana/media) ===");
  const tc = ticketCreators.map((r) => {
    const arr = (r.durations || "").split(",").map((s) => parseInt(s, 10)).filter(Number.isFinite);
    return {
      user: r.name ?? r.userId ?? "anon",
      n: arr.length,
      avg_ms: arr.length ? Math.round(arr.reduce((a, b) => a + b) / arr.length) : 0,
      median_ms: median(arr),
    };
  });
  console.table(tc);

  console.log("\n=== TOP BÚSQUEDAS ===");
  console.table(JSON.parse(JSON.stringify(top_searches, replacer)));

  console.log("\n=== ERRORES CLIENTE ===");
  console.table(JSON.parse(JSON.stringify(errors, replacer)));
}

run(7).catch((e) => console.error(e)).finally(() => prisma.$disconnect());
