/**
 * Generador automático de "Novedades" leyendo `git log` del repositorio.
 *
 * Diseñado para que Saúl (único autorizado) genere borradores de changelog
 * desde el último announcement de tipo `novedad` publicado, sin tener que
 * escribir manualmente la lista de cambios.
 *
 * Estrategia:
 *  1. Calcula `since` = `createdAt` del último Announcement `kind=novedad`
 *     publicado. Si no hay ninguno, se usan los últimos 14 días.
 *  2. `git log --no-merges --pretty=...` desde `since` hasta HEAD.
 *  3. De cada commit lee subject Y cuerpo completo. Si el cuerpo trae bullets
 *     (`- ...`), cada bullet se convierte en un item independiente del
 *     changelog. Si trae secciones (`### Foo`) las usa como categoría.
 *  4. Clasifica items por keywords en castellano + inglés en tres grupos:
 *     **Nuevas funcionalidades**, **Correcciones**, **Mejoras y mantenimiento**.
 *  5. Genera un borrador Markdown listo para publicar — los hashes técnicos
 *     se agrupan al final, no se mezclan con los items legibles.
 *
 * Importante: NO ejecuta nada en la base de datos. Solo devuelve el borrador
 * para que el usuario lo revise/edite y lo publique con el flujo normal de
 * `POST /api/announcements`.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitCommit = {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  subject: string;
  /** Cuerpo del commit (texto crudo, líneas separadas por `\n`). */
  body: string;
};

type Kind = "feat" | "fix" | "other";

type ChangelogItem = {
  text: string;
  kind: Kind;
  shortHash: string;
};

export type ChangelogDraft = {
  title: string;
  bodyMd: string;
  commits: GitCommit[];
  since: string | null;
  /** Ruta de git utilizada (para debug en caso de fallo en producción). */
  repoCwd: string;
};

const KEYWORDS_FEAT =
  /\b(feat|feature|añad|anad|nuev[oa]|implement|agreg|crea|incluy|incorpor|introdu|soporte para|sumamos|estrenam)/i;
const KEYWORDS_FIX =
  /\b(fix|bug|err|arregl|corrig|correc|resuelv|repar|soluc|hotfix)/i;
const KEYWORDS_NOISE =
  /\b(merge\s|wip|tmp|temporal|test commit|\.\.\.)/i;

/**
 * Si una sección del cuerpo del commit lleva uno de estos títulos, el
 * generador asume que SOLO esos bullets son los pensados para usuarios
 * finales y descarta el resto del cuerpo. Permite mantener el commit
 * técnico (útil para revisión de código) y a la vez tener un resumen
 * legible para Saúl y sus compañeros del centro.
 *
 * Ejemplo de uso en un commit:
 *
 *   feat: rediseño del menú
 *
 *   (detalles técnicos: refactor de app-sidebar, nuevo componente
 *   SectionTabs, etc.)
 *
 *   ## Para usuarios
 *   - El menú es ahora más sencillo: 9 opciones en lugar de 14.
 *   - Los enlaces guardados siguen funcionando.
 */
const USER_SECTION_HEADER =
  /^#{1,4}\s*(para\s+usuarios?|para\s+los?\s+compa[ñn]er[oa]s|qu[eé]\s+cambia|cambios\s+visibles|user\s*-?\s*facing|customer\s+notes?)\b/i;

/** Secciones explícitas que el autor del commit puede usar en el cuerpo. */
const SECTION_HEADER_KIND: Array<{ pattern: RegExp; kind: Kind }> = [
  {
    pattern:
      /^#{1,4}\s*(nuevas?\s+funcionalidades|funcionalidades|features?|nuevas?|novedades)/i,
    kind: "feat",
  },
  {
    pattern: /^#{1,4}\s*(correc[ióc]?n?es?|fixes?|bugs?|errores)/i,
    kind: "fix",
  },
  {
    pattern: /^#{1,4}\s*(mejoras?|cambios?|refactor|mantenimiento|otros)/i,
    kind: "other",
  },
];

/** Clasifica un texto cualquiera (subject o item) por palabras clave. */
function classifyText(text: string): Kind {
  if (KEYWORDS_FIX.test(text)) return "fix";
  if (KEYWORDS_FEAT.test(text)) return "feat";
  return "other";
}

/** Quita prefijos conventional commit (feat:, fix(scope):, etc.). */
function stripConventionalPrefix(s: string): string {
  return s.replace(
    /^(feat|fix|chore|docs|build|ci|refactor|perf|style|test)(\([^)]*\))?:\s*/i,
    "",
  );
}

/**
 * Diccionario de traducción jerga técnica → lenguaje cotidiano. Cada entrada
 * es `[pattern, replacement]`. El orden importa: las frases más largas (más
 * específicas) van antes que sus partes (más cortas) para no destrozar
 * coincidencias mayores.
 *
 * Mantén las reglas BREVES y conservadoras: si dudas, deja el término como
 * está. El usuario siempre puede editar el borrador antes de publicar.
 */
/**
 * Patrones de paréntesis que son ruido técnico puro y deben eliminarse en su
 * totalidad. Se aplican ANTES del diccionario humano para no romper su
 * contenido (p.ej. "(Web Speech API)" debe verse como un bloque; si la "API"
 * se borrara antes, este patrón ya no lo cazaría).
 */
const TECH_PARENTHETICALS: RegExp[] = [
  // Paréntesis con una sola ruta dentro: "(/preventivo)", "(/api/foo)"
  /\s*\(\s*\/[A-Za-z0-9/_\-[\]]+\s*\)/g,
  // Nombres de proveedores / librerías entre paréntesis sueltos.
  /\s*\(\s*(?:Resend|Twilio|Tesseract|NSSM|Web\s+Speech\s+API|Web\s+Speech|Recharts|Prisma|SQLite|Tailwind|ExcelJS|html-to-image|dnd-kit|node\.js|Next\.js)\s*\)/gi,
  // Referencias a archivos fuente: "(en ticketing.ts)", "(app-sidebar.tsx)"
  /\s*\(\s*(?:en\s+|antes\s+hardcoded\s+en\s+)?[A-Za-z0-9_\-/.]+\.(?:ts|tsx|js|jsx|prisma|sql|mjs)\s*\)/gi,
  // "(modelo XYZ en BD)" - menciones a modelos Prisma
  /\s*\(\s*modelo\s+[A-Za-z]+\s+en\s+BD[^)]*\)/gi,
  // "(Asset.slaMinutes)", "(User.role)" - referencias a campos.
  /\s*\(\s*[A-Z][a-zA-Z]+\.[a-zA-Z]+\s*\)/g,
];

/**
 * Diccionario de traducción jerga técnica → lenguaje cotidiano. Cada entrada
 * es `[pattern, replacement]`. El orden importa: las frases más largas (más
 * específicas) van antes que sus partes (más cortas) para no destrozar
 * coincidencias mayores.
 *
 * Mantén las reglas BREVES y conservadoras: si dudas, deja el término como
 * está. El usuario siempre puede editar el borrador antes de publicar.
 */
const HUMAN_REPLACEMENTS: Array<[RegExp, string]> = [
  // ── Frases completas (van primero para que tengan prioridad) ───────────
  // Eliminamos fragmentos técnicos enteros (con su preposición de unión)
  // para no dejar restos como "modo aplicación con .".
  [/(?:,\s+)?\bservice\s+worker\s+con\s+cache-first[^,.;]*(?:y\s+network-first[^,.;]*)?/gi, ", funciona sin conexión a internet"],
  [/\bcache-first[^,.;]*/gi, ""],
  [/\bnetwork-first[^,.;]*/gi, ""],
  [/\bSSE en vivo\b/gi, "actualizaciones en tiempo real"],
  [/\bSSE\b/g, "en tiempo real"],
  [/\bstream\s+en\s+tiempo\s+real\b/gi, "actualizaciones en tiempo real"],
  [/\bstream\s+SSE\b/gi, "actualizaciones en tiempo real"],
  [/\bnotification\s+bell\b/gi, "campana de avisos"],
  [/\btoast\s+host\s+global\b/gi, "avisos emergentes globales"],
  [/\bexport\s+XLSX\s*\/\s*PDF\b/gi, "exportar a Excel y PDF"],
  [/\bexport\s+XLSX\b/gi, "exportar a Excel"],
  [/\bexport\s+PDF\b/gi, "exportar a PDF"],
  [/\bgr[áa]ficos\s+SVG\b/gi, "gráficos"],
  [/\bsugerencias\s+de\s+KB\s+al\s+titular\b/gi, "sugerencias de artículos al escribir el título"],
  [/\bcomentarios\s+por\s+voz\b/gi, "comentarios dictados por voz"],
  [/\bdrag\s*&?\s*drop\b/gi, "arrastrar y soltar"],
  [/\bwidgets?\b/gi, "tarjetas"],
  [/\bpoller\s+de\s+email(?:\s+IMAP)?\b/gi, "lectura automática del correo entrante"],
  [/\bOCR\s+de\s+PDF(?:\s+con\s+Tesseract)?\b/gi, "lectura de texto en PDFs escaneados"],
  [/\bcron\s+diario\b/gi, "tarea diaria automática"],
  [/\bDailyReport\s+XLSX\b/gi, "reporte diario en Excel"],
  [/\breglas?\s+SLA\b/gi, "reglas de plazos"],
  [/\bSLA\s+configurable\s+por\s+prioridad\b/gi, "plazos de resolución configurables por prioridad"],
  [/\bauto-escalado\b/gi, "escalado automático"],
  [/\baviso\s+de\s+vencimiento\b/gi, "aviso cuando el plazo va a vencer"],
  [/\btop\s+buses\b/gi, "buses con más incidencias"],
  [/\bbuses\s+an[óo]malos\b/gi, "buses con comportamiento anómalo"],
  [/\bPWA\s+offline\b/gi, "uso sin conexión"],
  [/\bPWA\b/g, "modo aplicación"],
  [/\bcola\s+de\s+borradores\s+en\s+localStorage\b/gi, "los borradores quedan guardados en el navegador"],
  [/\blocalStorage\b/gi, "el navegador"],
  [/\bcambio\s+de\s+contraseña\s+obligatorio\b/gi, "cambio de contraseña obligatorio al primer acceso"],
  [/\baccount\s+profile\b/gi, "perfil"],
  [/\bimport\s+CSV\b/gi, "importación masiva desde CSV"],
  [/\bRBAC\s+ampliado\b/gi, "más permisos configurables por rol"],
  [/\bRBAC\b/g, "permisos por rol"],
  // "vía el nuevo componente Foo" se elimina por completo (deja el contexto
  // anterior que ya describe el cambio sin esa coletilla técnica).
  [/(?:,\s+)?\bv[ií]a\s+(?:el\s+)?(?:nuevo\s+)?componente\s+\w+/gi, ""],
  [/\bservicio\s+Windows\s+con\s+NSSM\b/gi, "el servidor corre como servicio Windows"],
  [/\btarea\s+programada\s+para\s+evitar\s+UAC\b/gi, "reinicio sin pedir permisos de administrador"],
  [/\bsnapshot\s+de\s+tickets?\s+abiertos\b/gi, "lista de tickets abiertos del turno"],
  [/\bfirma\s+de\s+acuse\b/gi, "firma de recepción del turno entrante"],
  [/\bplantilla\s+HTML\b/gi, "formato uniforme"],
  [/\bcon\s+plantilla\s+con\s+formato\b/gi, "con formato uniforme"],
  [/\bauth\b/gi, "autenticación"],
  // El usuario final no necesita saber a qué endpoint llega: simplemente
  // describimos qué hace. Las menciones explícitas a "/api/..." se eliminan
  // en la fase de URLs.
  [/\bWebhook(?:\s+\/api\/[A-Za-z0-9/_\-]+)?\s+para\s+/gi, ""],
  [/\bWebhook\b/gi, "entrada automática"],
  [/\bbandeja\s+admin\b/gi, "bandeja de revisión"],
  [/(?<!\/)\bfeedback\b/gi, "sugerencias y opiniones"],
  [/\bsidebar\b/gi, "menú lateral"],
  [/\bscheduler\s+interno\b/gi, "tareas programadas internas"],
  [/\bscheduler\b/gi, "tareas programadas"],
  [/\bchangelog\s+desde\s+git\b/gi, "lista de cambios autogenerada"],
  [/\bchangelog\b/gi, "lista de cambios"],
  [/\bparser\b/gi, "extracción automática de datos"],
  [/\bpresets?\s+visuales\b/gi, "estilos visuales predefinidos"],
  [/\bpresets?\b/gi, "plantillas predefinidas"],
  [/\bredimensionado\s+libre\b/gi, "cambio de tamaño libre"],
  [/\bvista\s+detalle\b/gi, "vista de detalle"],
  // "rebuild y restart": en contexto de scripts del servicio, suele aparecer
  // junto a otro "reinicio" más adelante. Lo simplificamos a sólo
  // "actualización" para evitar doble "reinicio" en el bullet final.
  [/\brebuild\s+y\s+restart\b/gi, "actualización"],
  [/\bsmoke\s+test\b/gi, "prueba rápida"],
  // Términos en inglés sueltos.
  [/\brebuild\b/gi, "reconstrucción"],
  [/\brestart\b/gi, "reinicio"],
  [/\breset\b/gi, "reseteo"],
  // ── Siglas sueltas ─────────────────────────────────────────────────────
  [/\bMTTR\b/g, "tiempo medio de reparación"],
  [/\bKPIs?\b/g, "indicadores"],
  [/\bKB\b/g, "Base de Conocimiento"],
  [/\bIMAP\b/g, "correo"],
  [/\bOCR\b/g, "lectura de texto"],
  [/\bUAC\b/g, "permisos de administrador"],
  // "API" la dejamos solo cuando va seguida de barra (es una ruta de
  // endpoint y no queremos romperla); en cualquier otro caso, fuera.
  [/\bAPI\b(?!\s*\/)/g, ""],
  [/\bSVG\b/g, ""],
  [/\bM\s*\/\s*T\s*\/\s*N\b/g, "(Mañana / Tarde / Noche)"],
  // ── Términos en inglés que sobreviven ──────────────────────────────────
  [/\blightbox\b/gi, "visor de imagen ampliable"],
  [/\bhardcoded\b/gi, "fijo en el código"],
  [/\bpreview\b/gi, "previsualización"],
  [/\bbacklog\b/gi, "pendientes sin fecha"],
  // "Dashboard" (mayúscula, nombre del ítem del menú lateral) → "Inicio",
  // que coincide con la URL_LABEL del propio sidebar y queda coherente al
  // listarlo con otros nombres propios (Tickets, Inventario, Mi cuenta).
  // "dashboard" (minúscula, referencia genérica al panel) → "panel".
  // Sin /i para que sea case-sensitive: cada regla aplica a su forma.
  [/(?<!\/)\bDashboards?\b/g, "Inicio"],
  [/(?<!\/)\bdashboards?\b/g, "panel"],
  [/\boverride\s+por\s+activo\b/gi, "se puede ajustar individualmente por activo"],
];

/**
 * Diccionario de URLs internas → nombre legible. Lo aplicamos como último
 * paso de la humanización para que el usuario lea "Pase de turno" en vez
 * de "/handover". Las URLs no listadas (p. ej. `/api/...`) se eliminan en
 * `humanizeItemText` porque son jerga interna.
 */
const URL_LABELS: Record<string, string> = {
  "/dashboard": "Inicio",
  "/dashboards": "Cuadros personalizados",
  "/reportes": "Reportes",
  "/handover": "Pase de turno",
  "/preventivo": "Calendario preventivo",
  "/feedback": "Sugerencias y opiniones",
  "/bandeja": "Bandeja",
  "/tickets": "Tickets",
  "/inventory": "Inventario",
  "/desvios": "Desvíos",
  "/mapa": "Mapa",
  "/kb": "Base de Conocimiento",
  "/novedades": "Novedades",
  "/account": "Mi cuenta",
  "/admin": "Administración",
  "/offline": "modo sin conexión",
};

/**
 * Sustituye URLs conocidas por su etiqueta legible. URLs `/api/...` se
 * eliminan: son endpoints internos que el usuario nunca toca directamente.
 */
function replaceUrls(text: string): string {
  // 1) Las URLs `/api/...` son jerga interna: las borramos junto a su
  //    preposición de unión (p. ej. "punto de entrada /api/foo para Y" →
  //    "para Y"). Cualquier "/api/..." suelto que sobreviva, fuera.
  let out = text.replace(/(?:^|\s)\/api\/[A-Za-z0-9/_\-[\]]+/g, " ");
  // 2) URLs conocidas → etiqueta humana. Ordenamos por longitud descendente
  //    para que "/dashboards" se case antes que "/dashboard" (substring).
  const ordered = Object.keys(URL_LABELS).sort((a, b) => b.length - a.length);
  for (const path of ordered) {
    // \B antes de "/" porque "/" no es \w; al final, frontera de palabra.
    const re = new RegExp(`(?<![A-Za-z0-9_-])${path.replace(/\//g, "\\/")}\\b`, "g");
    out = out.replace(re, URL_LABELS[path]);
  }
  return out;
}

/**
 * Pasa un texto crudo del item por:
 *  1) Eliminación de paréntesis técnicos.
 *  2) Reemplazos del diccionario humano (siglas, jerga, frases).
 *  3) Sustitución de URLs por nombres legibles.
 *  4) Limpieza de residuos (paréntesis vacíos, dobles comas, "con .").
 */
function humanizeItemText(input: string): string {
  let out = input;
  // 1) Quitar paréntesis técnicos ANTES de tocar siglas, para que patrones
  //    como "(Web Speech API)" se cacen como bloque.
  for (const pattern of TECH_PARENTHETICALS) {
    out = out.replace(pattern, "");
  }
  // 2) Diccionario humano. Las URLs están protegidas por lookbehind `/`.
  for (const [pattern, replacement] of HUMAN_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // 3) URLs → etiquetas humanas (después del diccionario para que los
  //    reemplazos de palabras no toquen el `/` y, al ya estar humanizado el
  //    resto, las labels queden bien encajadas en la oración).
  out = replaceUrls(out);
  // 4) Limpieza de residuos típicos al haber borrado fragmentos.
  // Paréntesis vacíos o con solo puntuación que hayan quedado.
  out = out.replace(/\(\s*[,;\s]*\s*\)/g, "");
  // " con ." → "." (queda al borrar un fragmento detrás de "con")
  out = out.replace(/\s+con\s*([.,;:])/g, "$1");
  // " y ." → "."  ;  " y ," → ","
  out = out.replace(/\s+y\s*([.,;:])/g, "$1");
  // " para X." donde X queda vacío después del borrado → "."
  out = out.replace(/\s+para\s*([.,;:])/g, "$1");
  // ", ," / ",." / "  ,"
  out = out.replace(/\s+([.,;:])/g, "$1");
  out = out.replace(/,\s*,/g, ",");
  out = out.replace(/,\s*\./g, ".");
  // ", ;" / "; ,"
  out = out.replace(/[,;]\s*[,;]/g, ";");
  // Espacios múltiples → uno.
  out = out.replace(/\s+/g, " ").trim();
  // Mayúscula tras punto y espacio (cuando hemos roto la frase). Tras `;` y
  // `,` mantenemos minúsculas — son separadores dentro de la misma oración.
  out = out.replace(/\.\s+([a-záéíóúñ])/g, (_m, c) => `. ${c.toUpperCase()}`);
  return out;
}

function cleanItemText(text: string): string {
  let out = stripConventionalPrefix(text);
  // Suprimir los hashes "(bb77505)" o "_(bb77505)_" que el autor pueda haber
  // dejado dentro de un item; los reagrupamos al final.
  out = out.replace(/\s*[_*]?\(\s*[0-9a-f]{7,40}\s*\)[_*]?\s*$/i, "");
  // Humanizar siglas y jerga técnica para el lector final.
  out = humanizeItemText(out);
  out = out.replace(/\s+/g, " ").trim();
  // Mayúscula inicial: ayuda a la lectura.
  if (out.length > 0) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}

function formatCanaryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    timeZone: "Atlantic/Canary",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Parsea bullets de un cuerpo Markdown. Soporta:
 *  - Líneas que empiezan por `-`, `*`, `•` con espacios opcionales antes.
 *  - Sub-bullets (con indentación) y líneas de continuación se concatenan
 *    al bullet anterior.
 *  - Líneas vacías cierran el bullet en curso.
 *  - Headers `### Foo` aplican categoría al resto de bullets hasta el
 *    siguiente header (si reconocemos su nombre).
 *
 * Si el cuerpo no tiene bullets, devuelve [].
 */
function extractItemsFromBody(
  body: string,
  defaultKind: Kind,
  shortHash: string,
): ChangelogItem[] {
  const items: ChangelogItem[] = [];
  if (!body.trim()) return items;

  // Si el commit incluye una sección "## Para usuarios" (o similar), recortamos
  // el cuerpo a SOLO esa sección. Así el autor del commit puede dejar todo el
  // detalle técnico arriba y un resumen humano debajo sin que el generador
  // mezcle ambos. Si no existe esa marca, procesamos el cuerpo completo.
  const lines = body.split(/\r?\n/);
  let effective = lines;
  const userIdx = lines.findIndex((l) => USER_SECTION_HEADER.test(l.trim()));
  if (userIdx >= 0) {
    // Cogemos desde la línea siguiente al header hasta el próximo header de
    // nivel similar (o final del cuerpo).
    const slice: string[] = [];
    for (let i = userIdx + 1; i < lines.length; i += 1) {
      const l = lines[i];
      if (/^#{1,4}\s+/.test(l.trim()) && !USER_SECTION_HEADER.test(l.trim())) {
        break;
      }
      slice.push(l);
    }
    effective = slice;
  }

  let current: { text: string; kind: Kind } | null = null;
  let sectionKind: Kind | null = null;

  const flush = () => {
    if (!current) return;
    const text = cleanItemText(current.text);
    if (text.length === 0) {
      current = null;
      return;
    }
    items.push({ text, kind: current.kind, shortHash });
    current = null;
  };

  for (const raw of effective) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();

    // Header de sección: actualiza la categoría por defecto si la reconocemos.
    const headerMatch = trimmed.match(/^#{1,4}\s+/);
    if (headerMatch) {
      flush();
      const matched = SECTION_HEADER_KIND.find((s) => s.pattern.test(trimmed));
      sectionKind = matched ? matched.kind : null;
      continue;
    }

    // Línea vacía: cierra el bullet actual.
    if (trimmed.length === 0) {
      flush();
      continue;
    }

    // Bullet nuevo: -, *, • opcionalmente con indentación.
    const bulletMatch = line.match(/^\s*[-*•]\s+(.+)$/);
    if (bulletMatch) {
      flush();
      const text = bulletMatch[1].trim();
      // Heurística: si el item ya empieza con "Fix:" / "Arregla" etc.
      // clasificamos individualmente; si no, usamos la sección actual o el
      // defaultKind del commit.
      const itemKind = classifyText(text);
      const kind: Kind =
        itemKind !== "other"
          ? itemKind
          : sectionKind ?? defaultKind;
      current = { text, kind };
      continue;
    }

    // Línea de continuación: la pegamos al bullet vigente con un espacio.
    // (Solo si hay bullet en curso — ignoramos texto suelto del cuerpo.)
    if (current) {
      current.text += ` ${trimmed}`;
    }
  }

  flush();
  return items;
}

export async function buildChangelogDraftFromGit(options: {
  since: Date | null;
  /** cwd del repo. Por defecto process.cwd() (raíz del proyecto). */
  cwd?: string;
  /** Máximo de commits a leer (defensa contra logs gigantes). */
  maxCommits?: number;
  /** Timeout en ms para matar git si se cuelga. Por defecto 10s. */
  timeoutMs?: number;
}): Promise<ChangelogDraft> {
  const cwd = options.cwd ?? process.cwd();
  const maxCommits = options.maxCommits ?? 200;
  const since = options.since ?? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const timeoutMs = options.timeoutMs ?? 10_000;

  // Formato seguro: usamos delimitadores improbables entre campos y entre
  // commits para poder parsear sin riesgo de colisión con el contenido del
  // commit (especialmente el body, que puede tener `|`, saltos de línea, etc.).
  //
  // - `%x1f` (Unit Separator, U+001F) separa campos dentro del mismo commit.
  // - `%x1e` (Record Separator, U+001E) separa commits.
  // - `%B` = subject + cuerpo completo del commit (mensaje sin tocar).
  const FS = "\x1f"; // Unit Separator
  const RS = "\x1e"; // Record Separator
  const FORMAT = `${RS}%H${FS}%h${FS}%aI${FS}%an${FS}%B`;

  // `safe.directory=*`: el servicio corre como NT AUTHORITY\SYSTEM y el repo
  // pertenece al usuario `Incidencias`. Sin este flag git rechazaría operar
  // por la protección CVE-2022-24765 ("detected dubious ownership"). Lo
  // pasamos en línea con `-c` para no modificar la config global del sistema.
  const args = [
    "-c",
    "safe.directory=*",
    "-c",
    "core.quotepath=false",
    "log",
    "--no-merges",
    `--since=${since.toISOString()}`,
    `--max-count=${maxCommits}`,
    `--pretty=format:${FORMAT}`,
    "HEAD",
  ];

  // Variables de entorno defensivas:
  //  - HOME/USERPROFILE: que apunten al cwd para que git no intente leer
  //    config de un home inaccesible (LocalSystem no tiene perfil de usuario).
  //  - GIT_TERMINAL_PROMPT=0: nunca pidas credenciales (evita colgarse).
  //  - GIT_OPTIONAL_LOCKS=0: no intentes adquirir locks lentos.
  const env = {
    ...process.env,
    HOME: process.env.HOME ?? cwd,
    USERPROFILE: process.env.USERPROFILE ?? cwd,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  };

  let stdout = "";
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      env,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    stdout = result.stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[changelog-from-git] git falló:", detail, { cwd, args });
    return {
      title: `Novedades (sin commits detectados)`,
      bodyMd:
        `> No se pudo leer el historial de git desde el servidor.\n\n` +
        `_Detalle técnico:_ \`${detail}\`\n\n` +
        `_Repo:_ \`${cwd}\``,
      commits: [],
      since: since.toISOString(),
      repoCwd: cwd,
    };
  }

  // Cada commit empieza con `RS`. Saltamos el primer fragmento (vacío, antes
  // del primer RS) y parseamos los demás.
  const rawCommits = stdout.split(RS).slice(1);

  const commits: GitCommit[] = [];
  for (const raw of rawCommits) {
    const [hash, shortHash, date, author, ...rest] = raw.split(FS);
    if (!hash) continue;
    // `%B` puede incluir más FS si el mensaje los tuviera (improbable, pero
    // defensivo): juntamos el resto.
    const fullMessage = rest.join(FS).replace(/^\s+|\s+$/g, "");
    // La primera línea de `%B` es el subject; el resto (tras un \n en blanco
    // canónicamente) es el cuerpo.
    const nlIdx = fullMessage.indexOf("\n");
    const subject = (nlIdx === -1 ? fullMessage : fullMessage.slice(0, nlIdx)).trim();
    const body = nlIdx === -1 ? "" : fullMessage.slice(nlIdx + 1).replace(/^\n+/, "");
    if (!subject) continue;
    if (KEYWORDS_NOISE.test(subject)) continue;
    commits.push({
      hash,
      shortHash: shortHash ?? "",
      date: date ?? "",
      author: author ?? "",
      subject,
      body,
    });
  }

  // Extracción de items: cada commit aporta uno o varios.
  const allItems: ChangelogItem[] = [];
  for (const c of commits) {
    const subjectKind = classifyText(c.subject);
    const items = extractItemsFromBody(c.body, subjectKind, c.shortHash);
    if (items.length === 0) {
      // Sin bullets: el subject sirve de único item.
      const text = cleanItemText(c.subject);
      if (text.length > 0) {
        allItems.push({ text, kind: subjectKind, shortHash: c.shortHash });
      }
    } else {
      allItems.push(...items);
    }
  }

  // Agrupar por categoría preservando el orden de aparición.
  const feats = allItems.filter((i) => i.kind === "feat");
  const fixes = allItems.filter((i) => i.kind === "fix");
  const others = allItems.filter((i) => i.kind === "other");

  // Construcción del bodyMd.
  const totalCommits = commits.length;
  const totalItems = allItems.length;
  const fromLabel = formatCanaryDate(since.toISOString());
  const toLabel = formatCanaryDate(new Date().toISOString());
  const title = `Novedades · ${toLabel}`;

  const lines: string[] = [];

  if (totalCommits === 0) {
    lines.push(
      `_No se han detectado commits nuevos desde ${fromLabel}. Si los cambios están en el árbol de trabajo sin commitear, escribe la novedad manualmente._`,
    );
  } else {
    // Resumen humano: cuenta items, no commits — al usuario final le importa
    // qué se ha entregado, no cuántos commits hicimos.
    const itemsWord = totalItems === 1 ? "novedad" : "novedades";
    lines.push(
      `_${totalItems} ${itemsWord} entre ${fromLabel} y ${toLabel}._`,
    );
    lines.push("");

    if (feats.length > 0) {
      lines.push("### Nuevas funcionalidades");
      for (const item of feats) lines.push(`- ${item.text}`);
      lines.push("");
    }
    if (fixes.length > 0) {
      lines.push("### Correcciones");
      for (const item of fixes) lines.push(`- ${item.text}`);
      lines.push("");
    }
    if (others.length > 0) {
      lines.push("### Mejoras y mantenimiento");
      for (const item of others) lines.push(`- ${item.text}`);
      lines.push("");
    }

    // Referencias técnicas: los hashes agrupados al final. Útiles para Saúl
    // o cualquier admin que quiera rastrear el cambio en git, sin meter
    // ruido entre los bullets que ve el usuario final. Usamos solo markdown
    // (cursiva) — el renderer de la vista previa sanitiza HTML inline.
    const uniqueHashes = Array.from(
      new Set(commits.map((c) => c.shortHash).filter(Boolean)),
    );
    if (uniqueHashes.length > 0) {
      lines.push(
        `_Basado en ${totalCommits} commit${totalCommits === 1 ? "" : "s"}: ${uniqueHashes.join(", ")}._`,
      );
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(
    `_Borrador generado automáticamente desde el repositorio en \`${path.basename(cwd)}\`. Revísalo y edítalo antes de publicar._`,
  );
  lines.push("");
  // Truco como blockquote: se ve discreto pero legible en la vista previa.
  lines.push(
    `> _Truco para el autor del commit:_ añade una sección \`## Para usuarios\` al final del mensaje y, en próximas novedades, este borrador usará SOLO esos bullets — escritos por ti para tus compañeros.`,
  );

  return {
    title,
    bodyMd: lines.join("\n"),
    commits,
    since: since.toISOString(),
    repoCwd: cwd,
  };
}
