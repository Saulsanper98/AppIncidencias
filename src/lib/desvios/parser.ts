/**
 * Parser del PDF "Circular Informativa" emitido por jefesala@movilidadgc.org.
 *
 * Diseño: NO lanzamos excepciones si falta algun campo opcional; solo cuando
 * la cabecera (referencia + titulo + horario) no aparece y no hay forma de
 * crear un registro coherente. El poller decide si reintentar o no.
 *
 * El texto plano que recibimos viene de `pdf-parse`, que respeta saltos de
 * linea pero puede insertar espacios extra. La estrategia es:
 *   1. Normalizar (saltos, NBSP, espacios duplicados).
 *   2. Extraer cabecera (referencia, entorno, titulo).
 *   3. Extraer horario y fecha del titulo + horario.
 *   4. Extraer campos de cuerpo (tramo, motivo, sentido, lineas, paradas).
 *
 * Para los campos del cuerpo se buscan rangos entre labels conocidos para
 * tolerar que aparezcan en distinto orden segun el formato de la circular.
 */

import type {
  DesvioParseado,
  DesvioSentido,
  ParadaDesvio,
} from "./types";
import { addCanaryDays, dateInCanary, withCanaryTime } from "../datetime/canary";

const MESES_ES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/**
 * Labels reconocidos del cuerpo de la circular. El parser usa la posicion de
 * cada uno (case-insensitive, sin tildes) para acotar el texto de cada campo.
 *
 * Cada label admite varias variantes porque las circulares no siempre usan
 * exactamente la misma redaccion (singular/plural, tildes...).
 */
const LABELS = {
  horario: [
    "horario del cierre",
    "hora del cierre",
    "horario del corte",
    "hora del corte",
    // Variantes de las nuevas circulares "infografia" (PowerPoint -> PDF):
    // el OCR puede comerse la "L" inicial de "del cierre". El campo aparece
    // como una linea suelta seguida de "desde las HH:MM y hasta las HH:MM".
    "del cierre de la via",
    "del corte de la via",
    "horario",
  ],
  tramo: [
    "tramo que comprende el cierre",
    "tramo que comprende el corte",
    "tramo afectado",
    "tramo",
  ],
  motivo: ["motivo"],
  lineas: [
    "lineas afectadas",
    "linea afectada",
    "lineas implicadas",
    "linea implicada",
    // Tolerancias para OCR de las infografias: la "L" inicial se suele perder.
    "ineas afectadas",
    "inea afectada",
  ],
  sentido: ["sentido afectado", "sentido"],
  itinerario: [
    "itinerario alternativo",
    "itinerarios alternativos",
    "itinerario",
  ],
  paradasFuera: [
    "paradas fuera de servicio",
    "parada fuera de servicio",
    // OCR perde "P" inicial / palabra "Paradas".
    "fuera de servicio",
  ],
  paradasAlt: [
    "paradas alternativas",
    "parada alternativa",
  ],
} as const;

type LabelKey = keyof typeof LABELS;

const ALL_LABEL_VARIANTS: { key: LabelKey; variant: string }[] = (() => {
  const out: { key: LabelKey; variant: string }[] = [];
  (Object.keys(LABELS) as LabelKey[]).forEach((key) => {
    for (const variant of LABELS[key]) {
      out.push({ key, variant });
    }
  });
  // Variantes mas largas primero para que "paradas fuera de servicio" gane a "paradas".
  out.sort((a, b) => b.variant.length - a.variant.length);
  return out;
})();

/** Normaliza el texto del PDF: saltos, espacios y NBSP. NO elimina tildes. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[\t]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n[ ]+/g, "\n")
    .replace(/[ ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Quita tildes para hacer matching case/accent-insensitive contra labels. */
function strip(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Devuelve el indice (en `text`) del primer label posterior a `from`. */
function findFirstLabelAfter(
  text: string,
  from: number,
): { index: number; key: LabelKey; length: number } | null {
  const haystack = strip(text).toLowerCase();
  let best: { index: number; key: LabelKey; length: number } | null = null;
  for (const { key, variant } of ALL_LABEL_VARIANTS) {
    const idx = haystack.indexOf(variant, from);
    if (idx < 0) continue;
    if (best === null || idx < best.index) {
      best = { index: idx, key, length: variant.length };
    }
  }
  return best;
}

/** Extrae el bloque de texto correspondiente a `label` hasta el siguiente label. */
function extractField(text: string, key: LabelKey): string {
  const haystack = strip(text).toLowerCase();
  let bestStart = -1;
  let bestLen = 0;
  for (const variant of LABELS[key]) {
    const idx = haystack.indexOf(variant);
    if (idx < 0) continue;
    if (bestStart === -1 || idx < bestStart) {
      bestStart = idx;
      bestLen = variant.length;
    }
  }
  if (bestStart < 0) return "";

  const valueStart = bestStart + bestLen;
  const after = findFirstLabelAfter(text, valueStart);
  const valueEnd = after ? after.index : text.length;

  let value = text.slice(valueStart, valueEnd);
  // Quitar el ":" inicial si existe ("Motivo: Asfaltado...").
  value = value.replace(/^\s*[:\-]\s*/, "");
  return value.trim();
}

// ---------- Cabecera --------------------------------------------------------

function extractReferencia(text: string): string {
  // (PROD) 23052026 1140 → tambien aceptamos PROD sin parentesis pero con la
  // misma estructura por si la circular llega en variantes.
  const m = text.match(/\(\s*([A-Z]{2,8})\s*\)\s*(\d{6,8})\s+(\d{3,4})/i);
  if (m) {
    return `(${m[1].toUpperCase()}) ${m[2]} ${m[3].padStart(4, "0")}`;
  }
  return "";
}

/**
 * Construye una referencia sintetica para circulares que no traen la
 * cabecera "(PROD) ddmmyyyy hhmm" (las nuevas infografias de PowerPoint, por
 * ejemplo). Garantiza unicidad por contenido: el mismo texto OCR genera la
 * misma referencia, por lo que el deduplicador no creara registros repetidos
 * si el operador sube dos veces el mismo PDF.
 *
 * Formato: `(MANUAL) YYYYMMDD HHMM XXXXXX` donde XXXXXX es un hash FNV-1a de
 * los primeros 4 KB del texto en hex de 6 chars.
 */
function makeSyntheticReferencia(
  text: string,
  fecha: Date,
  horaInicio: string,
): string {
  const yyyymmdd = `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, "0")}${String(fecha.getDate()).padStart(2, "0")}`;
  const hhmm = horaInicio.replace(":", "");
  return `(MANUAL) ${yyyymmdd} ${hhmm} ${fnv1aHex(text.slice(0, 4096))}`;
}

function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

function extractEntorno(text: string): string {
  // Buscamos una linea propia con "PRODUCCION" o variantes; la circular suele
  // ponerla justo debajo de la referencia.
  const m = text.match(
    /\b(PRODUCCION|PRODUCCI?N|TEST|STAGING|PRE\b|PREPRODUCCION|PREPRODUCCI?N|DESARROLLO|DESA)\b/i,
  );
  if (!m) return "PRODUCCION";
  return strip(m[1]).toUpperCase();
}

/**
 * Saca el titulo: lo que va antes del primer label de cuerpo conocido,
 * descartando la cabecera (referencia, entorno) y filas vacias.
 */
function extractTitulo(text: string): string {
  const firstLabel = findFirstLabelAfter(text, 0);
  const cutoff = firstLabel ? firstLabel.index : text.length;
  const head = text.slice(0, cutoff);

  // Tiramos la referencia y la palabra del entorno si aparecen sueltas.
  const cleaned = head
    .replace(/\(\s*[A-Z]{2,8}\s*\)\s*\d{6,8}\s+\d{3,4}/i, "")
    .replace(
      /^\s*(PRODUCCION|PRODUCCI?N|TEST|STAGING|PRE|PREPRODUCCION|PREPRODUCCI?N|DESARROLLO|DESA)\s*$/gim,
      "",
    );

  // El titulo suele ser una unica linea o varias que se concatenan. En
  // circulares antiguas (texto vectorial) llega como un solo bloque; en las
  // nuevas (infografias OCR'eadas) cada subtitulo es una imagen distinta y
  // viene como una linea separada con "\n\n" entre medias. Para que el
  // extractor de fechas funcione en ambos casos, mantenemos TODAS las
  // lineas no vacias del bloque cabecera (excepto la que sea claramente
  // un encabezado generico como solo "CIRCULAR" o "Informativa").
  const SKIP = /^\s*(circular|informativa|circular\s+informativa)\s*$/i;
  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !SKIP.test(l));

  if (lines.length === 0) return "";

  const titulo = lines.join(" ");
  return titulo.replace(/\s{2,}/g, " ").trim().toUpperCase();
}

// ---------- Via -------------------------------------------------------------

/**
 * Extrae la "via" desde el titulo. Reglas (en orden de prioridad):
 *   1. Codigo de carretera tipo `GC-1`, `GC-100`, `LP-2`, etc.
 *   2. Avenida / calle / paseo / glorieta: la frase que sigue al sustantivo.
 *   3. Fallback: la primera "porcion" del titulo antes del primer separador.
 */
function extractVia(titulo: string): string {
  const m = titulo.match(/\b(GC|TF|LP|FV|LZ|EI)-\d{1,3}\b/i);
  if (m) return m[0].toUpperCase();

  // Truncamos el titulo en cuanto aparece la fecha (DOMINGO, LUNES,
  // "DEL DIA ...", "29 DE MAYO ..."). Asi `direccion` no engulle la fecha.
  const sinFecha = titulo
    .replace(
      /\b(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO|DEL\s+\d|\d{1,2}\s+(?:Y|AL|,)\s*\d{1,2}|\d{1,2}\s+DE\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE))/i,
      "|",
    )
    .split("|")[0];

  const direccion = sinFecha.match(
    /\b(AV(?:\.|ENIDA)?|CALLE|C\/|PASEO|GLORIETA|CARRETERA|CARR\.?|RONDA|AUTOVIA|AUTOPISTA|GC|TF)\b[^\/,]{2,60}/i,
  );
  if (direccion) {
    return direccion[0]
      .replace(/^CIERRE|^DESVIO|^DESV?O|^CORTE/i, "")
      .trim()
      .toUpperCase();
  }

  // Fallback: primera porcion antes de "/", ",", "-" del titulo "limpio".
  const head = sinFecha
    .replace(
      /^(CIERRE\s+(AL\s+TRAFICO|TEMPORAL\s+AL\s+TRAFICO|TEMPORAL)?|DESVIO|DESV?O|CORTE)\s*/i,
      "",
    )
    .split(/\s*[\/,]\s*/)[0]
    .trim();
  return head.toUpperCase();
}

// ---------- Horario y fechas ------------------------------------------------

type ParsedHorario = {
  hora_inicio: string; // "HH:MM"
  hora_fin: string; // "HH:MM"
  hora_fin_estimada: boolean;
};

function extractHorario(horarioRaw: string): ParsedHorario | null {
  // Buscamos en TODO el texto si lo pasaron sin campo (el OCR de las
  // infografias devuelve "desde las 22:00 y hasta las 06:00" como linea
  // suelta sin "Horario del cierre:" delante).
  const text = horarioRaw.toLowerCase();
  // Aceptamos hora con o sin minutos (OCR suele recortar ":00").
  const desde = text.match(/desde\s+las?\s+(\d{1,2})(?::(\d{2}))?/);
  const hasta = text.match(/hasta\s+las?\s+(\d{1,2})(?::(\d{2}))?/);
  if (!desde || !hasta) return null;
  const hora_fin_estimada = /previsiblemente/.test(text);
  const fmt = (h: string, m: string | undefined) =>
    `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
  return {
    hora_inicio: fmt(desde[1], desde[2]),
    hora_fin: fmt(hasta[1], hasta[2]),
    hora_fin_estimada,
  };
}

/**
 * Extrae todas las fechas del titulo. Reglas:
 *   - "DOMINGO 24 Y LUNES 25 DE MAYO DE 2026" ? [2026-05-24, 2026-05-25]
 *   - "29, 30 Y 31 DE OCTUBRE DE 2026"        ? [..-29, ..-30, ..-31]
 *   - "DOMINGO D?A 24 MAYO 2026"              ? [2026-05-24]
 *   - "DEL 24 AL 26 DE MAYO DE 2026"          ? [24, 25, 26]
 */
function extractFechasFromTitulo(titulo: string): Date[] {
  const normalized = strip(titulo).toLowerCase();
  // Localizamos el mes para acotar la busqueda de dias justo antes.
  const mesMatch = normalized.match(
    /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b\s*(?:de|del)?\s*(20\d{2})/,
  );
  if (!mesMatch) return [];
  const mes = MESES_ES[mesMatch[1]];
  const anio = Number.parseInt(mesMatch[2], 10);
  if (!mes || !Number.isFinite(anio)) return [];

  // Texto antes del mes: ahi viven los dias.
  // Pre-limpiamos lo que se confunde con dias:
  //   - codigos de carretera tipo "GC-5", "LP-2", "TF-110".
  //   - referencias tipo "(PROD) 23052026 1140" (no esperamos que esten en
  //     el titulo, pero por si las moscas).
  //   - cualquier secuencia de 4+ digitos.
  const before = normalized
    .slice(0, mesMatch.index ?? 0)
    .replace(/\b(gc|tf|lp|fv|lz|ei)\s*-\s*\d{1,3}\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\(\s*\w+\s*\)/g, " ");

  // Caso 1: rango "DEL X AL Y".
  const rango = before.match(/\bdel\s+(\d{1,2})\s+al\s+(\d{1,2})\b/);
  if (rango) {
    const start = Number.parseInt(rango[1], 10);
    const end = Number.parseInt(rango[2], 10);
    if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
      const dias: Date[] = [];
      for (let d = start; d <= end; d++) dias.push(buildDate(anio, mes, d));
      return dias;
    }
  }

  // Caso general: numeros de 1-2 cifras precedidos por inicio de palabra
  // (espacio, "dia" o un dia de la semana). Asi evitamos capturar "5"
  // dentro de "GC-5" o "1235" dentro de un codigo de parada.
  const dias: number[] = [];
  const re =
    /(?:^|\s)(?:dia\s+)?(\d{1,2})(?=\s|$|\,)/g;
  let m;
  while ((m = re.exec(before)) !== null) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 1 && n <= 31) dias.push(n);
  }
  // Deduplicamos manteniendo orden de aparicion.
  const unique: number[] = [];
  for (const d of dias) {
    if (!unique.includes(d)) unique.push(d);
  }
  return unique.slice(0, 4).map((d) => buildDate(anio, mes, d));
}

function buildDate(year: number, month: number, day: number): Date {
  // 00:00 hora canaria del dia indicado. Usamos el helper para que sea
  // independiente de la TZ del proceso (ver lib/datetime/canary.ts).
  return dateInCanary(year, month, day, 0, 0);
}

/**
 * Combina dia base + hora_inicio + hora_fin. Si hora_fin < hora_inicio
 * (cierre nocturno), fecha_fin se desplaza un dia.
 *
 * IMPORTANTE: las horas del PDF estan SIEMPRE en hora canaria
 * (Atlantic/Canary). Las convertimos a Date usando `withCanaryTime`, que
 * blinda contra la TZ del host: si el servicio Windows estuviera en
 * Europe/Madrid (default peninsular), `setHours` interpretaria las horas
 * como Madrid y al almacenarse en UTC saldrian desfasadas -1h al pintarlas
 * en el navegador. Con `withCanaryTime` el `Date` resultante representa
 * literalmente "HH:MM en Canarias" sin importar donde corra Node.
 */
function applyHorario(
  base: Date,
  horario: ParsedHorario,
): { fecha_inicio: Date; fecha_fin: Date } {
  const [hi, mi] = horario.hora_inicio.split(":").map(Number);
  const [hf, mf] = horario.hora_fin.split(":").map(Number);

  const fecha_inicio = withCanaryTime(base, hi, mi);
  let fecha_fin = withCanaryTime(base, hf, mf);

  if (
    hf < hi ||
    (hf === hi && mf < mi) ||
    fecha_fin.getTime() <= fecha_inicio.getTime()
  ) {
    // Cierre nocturno: el corte termina al dia siguiente. Sumamos 1 dia
    // civil en TZ Canary (no en TZ del proceso) para no desfasar por DST.
    fecha_fin = addCanaryDays(fecha_fin, 1);
  }
  return { fecha_inicio, fecha_fin };
}

// ---------- Lineas, sentido, paradas, url -----------------------------------

/**
 * Convierte el campo "Lineas afectadas" en array de strings. Soporta:
 *   - "303"                          → ["303"]
 *   - "19-36"                        → ["19", "36"]
 *   - "19, 36"                       → ["19", "36"]
 *   - "Lineas 19, 36 y 80"           → ["19","36","80"]
 *   - "L1, L2-L3"                    → ["L1", "L2", "L3"]
 */
function parseLineas(raw: string): string[] {
  if (!raw) return [];
  let value = raw.split("\n")[0]; // la primera linea suele bastar
  value = value
    .replace(/^\s*lineas?\s+/i, "")
    .replace(/\by\b/gi, ",")
    .trim();

  // 1) Caso "X-Y" puro (solo numeros): tratamos como [X, Y]. NO como rango,
  //    porque el formato real de la circular nunca usa "rango de lineas".
  const numericPair = value.match(/^(\d{1,4})\s*-\s*(\d{1,4})$/);
  if (numericPair) return [numericPair[1], numericPair[2]];

  // 2) En caso general, separamos por coma o "-", filtrando residuos.
  const parts = value
    .split(/[,;]/)
    .map((p) => p.trim())
    .flatMap((part) => {
      // si una "parte" sigue siendo "X-Y" (todos numeros) la dividimos.
      const pair = part.match(/^(\d{1,4})\s*-\s*(\d{1,4})$/);
      if (pair) return [pair[1], pair[2]];
      return [part];
    })
    .map((p) => p.replace(/[\s\.]+$/g, "").trim())
    .filter((p) => p.length > 0 && p.length < 12);

  return parts;
}

/** Mapea el texto del campo "Sentido afectado" a uno de los 3 enums. */
function parseSentido(raw: string): DesvioSentido {
  const v = strip(raw || "").toLowerCase();
  if (/ambos|ida\s*\/\s*vuelta|ida\s+y\s+vuelta/.test(v)) return "AMBOS";
  // Si menciona ambas palabras "ida" y "vuelta" en cualquier orden tambien.
  if (/ida/.test(v) && /vuelta/.test(v)) return "AMBOS";
  if (/vuelta/.test(v)) return "VUELTA";
  if (/ida/.test(v)) return "IDA";
  // Por defecto AMBOS: si la circular no especifica, asumimos peor caso (lo
  // ven todas las lineas en cualquier sentido).
  return "AMBOS";
}

/** Extrae paradas (nombre, codigo) de un bloque de texto. */
function parseParadas(raw: string): ParadaDesvio[] {
  if (!raw) return [];
  const result: ParadaDesvio[] = [];
  // El codigo puede ser "1234", "1234-5" o "1234-12".
  const re = /([^()\n,;]+?)\((\d{1,6}(?:-\d{1,4})?)\)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const nombre = m[1].replace(/^[\s\-:]+/, "").trim();
    const codigo = m[2].trim();
    if (nombre.length === 0) continue;
    result.push({ nombre, codigo });
  }
  return result;
}

/** Busca el primer enlace que parezca URL del itinerario alternativo. */
function parseUrl(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/https?:\/\/[^\s)<>"']+/i);
  return m ? m[0] : null;
}

// ---------- API publica -----------------------------------------------------

/**
 * Parsea el texto plano de una Circular Informativa y devuelve los campos
 * del primer dia. Lanza si no se reconocen la referencia, el titulo o las
 * fechas (basicas para identificar el documento como una circular real).
 */
export function parsearCircularPDF(texto: string): DesvioParseado {
  const all = parsearCircularPDFTodosLosDias(texto);
  if (all.length === 0) {
    throw new Error("No se pudo parsear el PDF como Circular Informativa.");
  }
  return all[0];
}

/**
 * Igual que `parsearCircularPDF` pero devuelve un registro por cada dia
 * detectado en el titulo (multidia). Usado por el poller para crear N
 * registros cuando la circular cubre varios dias consecutivos.
 */
export function parsearCircularPDFTodosLosDias(texto: string): DesvioParseado[] {
  if (typeof texto !== "string" || texto.trim().length === 0) {
    throw new Error("Texto vacio: no es una Circular Informativa.");
  }
  const text = normalize(texto);

  // La referencia "(PROD) ddmmyyyy hhmm" solo aparece en circulares antiguas
  // (texto vectorial). Las nuevas (infografias en PowerPoint exportadas a
  // PDF) llegan sin ella. Generamos una referencia sintetica deterministica
  // mas abajo, una vez tengamos fecha + hora_inicio. La marcamos vacia aqui
  // y la rellenamos al final.
  let referencia = extractReferencia(text);

  const entorno = extractEntorno(text);
  const titulo = extractTitulo(text);
  if (!titulo) {
    throw new Error("No se pudo determinar el titulo de la circular.");
  }

  // Buscamos horario primero en el campo etiquetado, y como fallback en el
  // texto completo (las infografias suelen tener "desde las HH:MM ... hasta
  // las HH:MM" como linea suelta).
  const horarioRaw = extractField(text, "horario");
  const horario =
    extractHorario(horarioRaw) ?? extractHorario(text);
  if (!horario) {
    throw new Error("No se encontro horario 'desde las HH:MM ... hasta las HH:MM'.");
  }

  const dias = extractFechasFromTitulo(titulo);
  if (dias.length === 0) {
    throw new Error("No se pudieron extraer fechas del titulo de la circular.");
  }

  if (!referencia) {
    referencia = makeSyntheticReferencia(text, dias[0], horario.hora_inicio);
  }

  const tramo = extractField(text, "tramo");
  const motivo = extractField(text, "motivo");
  const lineasRaw = extractField(text, "lineas");
  const sentidoRaw = extractField(text, "sentido");
  const itinerarioRaw = extractField(text, "itinerario");
  const paradasFueraRaw = extractField(text, "paradasFuera");
  const paradasAltRaw = extractField(text, "paradasAlt");

  const lineas_afectadas = parseLineas(lineasRaw);
  const sentido = parseSentido(sentidoRaw);
  const url_itinerario = parseUrl(itinerarioRaw);
  const paradas_fuera = parseParadas(paradasFueraRaw);
  const paradas_alternativas = parseParadas(paradasAltRaw);
  const via = extractVia(titulo);

  return dias.map((dia) => {
    const { fecha_inicio, fecha_fin } = applyHorario(dia, horario);
    return {
      referencia,
      entorno,
      titulo,
      via,
      tramo,
      fecha_inicio,
      fecha_fin,
      hora_fin_estimada: horario.hora_fin_estimada,
      motivo,
      sentido,
      lineas_afectadas,
      url_itinerario,
      paradas_fuera,
      paradas_alternativas,
    } satisfies DesvioParseado;
  });
}
