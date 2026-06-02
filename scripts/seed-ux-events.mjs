// Siembra UxEvent sintéticos realistas para probar /admin/analytics.
//
// Uso:
//   node scripts/seed-ux-events.mjs           → siembra ~600 eventos en 7 días
//   node scripts/seed-ux-events.mjs --clear   → borra todos los seeds (eventName con prefijo seed_*)
//
// Genera:
//   - page_visit (varias secciones, varias duraciones, varios turnos)
//   - ticket_create_open/_step/_complete/_abandon
//   - feedback_submit_open/_complete
//   - quickticket_open/_complete
//   - search_query con queries variados
//   - client_error con 3-4 mensajes diferentes
//
// IMPORTANTE: cualquier evento sembrado se etiqueta con `props.seed=true` y
// sessionId con prefijo `seed_` por si más adelante quieres filtrarlos.

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

const DAYS = 7;
const TOTAL_EVENTS = 600;

const USERS_FALLBACK = [
  { id: null, name: null }, // anónimo
];

const PATHS = [
  "/tickets",
  "/tickets",
  "/tickets",
  "/dashboard",
  "/dashboard",
  "/admin",
  "/admin/catalog",
  "/admin/users",
  "/feedback",
  "/preventivo",
  "/pase-turno",
  "/lectura",
  "/kb",
  "/admin/analytics",
];

const SEARCH_QUERIES = [
  "bus 105",
  "neumatico",
  "ticket 4521",
  "carlos",
  "puerta",
  "freno",
  "averia motor",
  "abierta hoy",
  "linea 18",
  "puerta trasera",
  "pase turno",
  "preventivo",
];

const ERROR_MESSAGES = [
  "TypeError: Cannot read properties of undefined (reading 'map')",
  "NetworkError: Failed to fetch /api/tickets",
  "ChunkLoadError: Loading chunk app/page failed",
  "Error: Cannot set property innerHTML of null",
];

const DEVICES = ["desktop", "desktop", "desktop", "mobile", "tablet"];

const SHIFTS = ["M", "M", "M", "T", "T", "N"];

const TIPOS = ["averia", "incidencia", "preventivo", "limpieza"];

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDateInRange(days) {
  const offsetMs = Math.random() * days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - offsetMs);
}

function deriveShift(date) {
  const h = date.getHours();
  if (h >= 6 && h < 14) return "M";
  if (h >= 14 && h < 22) return "T";
  return "N";
}

async function loadUsers() {
  try {
    const users = await prisma.$queryRawUnsafe(
      'SELECT id, name FROM "User" WHERE isActive = 1 LIMIT 8'
    );
    if (Array.isArray(users) && users.length) return users;
  } catch (e) {
    console.warn("No se pudieron cargar usuarios reales, usando fallback");
  }
  return USERS_FALLBACK;
}

async function insertEvent(row) {
  const props = row.props ? JSON.stringify({ ...row.props, seed: true }) : JSON.stringify({ seed: true });
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UxEvent" (id, userId, userRole, eventName, sessionId, path, durationMs, shift, device, props, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    row.userId ?? null,
    row.userRole ?? null,
    row.eventName,
    row.sessionId ?? `seed_${randomUUID().slice(0, 12)}`,
    row.path ?? null,
    row.durationMs ?? null,
    row.shift ?? null,
    row.device ?? null,
    props,
    row.createdAt.toISOString(),
  );
}

async function clearSeeds() {
  const n = await prisma.$executeRawUnsafe(
    `DELETE FROM "UxEvent" WHERE sessionId LIKE 'seed_%' OR (props IS NOT NULL AND json_extract(props, '$.seed') = 1)`
  );
  console.log(`Borrados ${n} eventos sintéticos.`);
}

async function seed() {
  const users = await loadUsers();
  console.log(`Sembrando ${TOTAL_EVENTS} eventos en ${DAYS} días con ${users.length} usuarios…`);

  let inserted = 0;

  for (let i = 0; i < TOTAL_EVENTS; i++) {
    const user = rand(users);
    const device = rand(DEVICES);
    const at = randomDateInRange(DAYS);
    const shift = deriveShift(at);
    const sessionId = `seed_${(user.id ?? "anon").slice(0, 6)}_${at.toISOString().slice(0, 10)}`;
    const path = rand(PATHS);

    const r = Math.random();

    if (r < 0.5) {
      // page_visit
      await insertEvent({
        userId: user.id,
        eventName: "page_visit",
        sessionId,
        path,
        durationMs: randInt(2_000, 90_000),
        shift,
        device,
        createdAt: at,
        props: { from_path: rand(PATHS) },
      });
    } else if (r < 0.65) {
      // funnel creación ticket: open + (complete | abandon)
      await insertEvent({
        userId: user.id,
        eventName: "ticket_create_open",
        sessionId,
        path: "/tickets",
        shift,
        device,
        createdAt: at,
      });
      const stepCount = randInt(2, 4);
      for (let s = 0; s < stepCount; s++) {
        await insertEvent({
          userId: user.id,
          eventName: "ticket_create_step",
          sessionId,
          path: "/tickets",
          durationMs: 0,
          shift,
          device,
          createdAt: new Date(at.getTime() + (s + 1) * 4_000),
          props: { step: s + 1 },
        });
      }
      const success = Math.random() < 0.7;
      const duration = randInt(20_000, 240_000);
      const end = new Date(at.getTime() + duration);
      await insertEvent({
        userId: user.id,
        eventName: success ? "ticket_create_complete" : "ticket_create_abandon",
        sessionId,
        path: "/tickets",
        durationMs: duration,
        shift,
        device,
        createdAt: end,
        props: { tipo: rand(TIPOS), attachments_count: randInt(0, 3) },
      });
      inserted += 2 + stepCount;
    } else if (r < 0.78) {
      // search_query
      const q = rand(SEARCH_QUERIES);
      const nRes = randInt(0, 25);
      await insertEvent({
        userId: user.id,
        eventName: "search_query",
        sessionId,
        path: "/tickets",
        shift,
        device,
        createdAt: at,
        props: { query: q, length: q.length, n_results: nRes, has_results: nRes > 0 },
      });
    } else if (r < 0.88) {
      // feedback_submit
      await insertEvent({
        userId: user.id,
        eventName: "feedback_submit_open",
        sessionId,
        path: "/feedback",
        shift,
        device,
        createdAt: at,
      });
      if (Math.random() < 0.65) {
        const duration = randInt(15_000, 180_000);
        await insertEvent({
          userId: user.id,
          eventName: "feedback_submit_complete",
          sessionId,
          path: "/feedback",
          durationMs: duration,
          shift,
          device,
          createdAt: new Date(at.getTime() + duration),
          props: {
            type: rand(["bug", "idea", "queja", "elogio"]),
            category: rand(["ui", "rendimiento", "datos", "otro"]),
            rating: randInt(1, 5),
          },
        });
        inserted += 1;
      }
    } else if (r < 0.95) {
      // quickticket
      await insertEvent({
        userId: user.id,
        eventName: "quickticket_open",
        sessionId,
        path,
        shift,
        device,
        createdAt: at,
        props: { template_id: `tpl_${randInt(1, 5)}`, template_name: rand(["Pinchazo", "Avería motor", "Limpieza", "Puerta", "Aire"]) },
      });
      if (Math.random() < 0.85) {
        const duration = randInt(4_000, 40_000);
        await insertEvent({
          userId: user.id,
          eventName: "quickticket_complete",
          sessionId,
          path,
          durationMs: duration,
          shift,
          device,
          createdAt: new Date(at.getTime() + duration),
          props: { tipo: rand(TIPOS) },
        });
        inserted += 1;
      }
    } else {
      // client_error
      await insertEvent({
        userId: user.id,
        eventName: "client_error",
        sessionId,
        path,
        shift,
        device,
        createdAt: at,
        props: { message: rand(ERROR_MESSAGES), stack: "at seed (synthetic)", componentStack: null },
      });
    }
    inserted += 1;
  }

  console.log(`Listo. Insertados ~${inserted} eventos sintéticos.`);
}

async function main() {
  if (process.argv.includes("--clear")) {
    await clearSeeds();
  } else {
    await seed();
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
