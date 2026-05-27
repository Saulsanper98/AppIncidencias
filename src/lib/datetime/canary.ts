/**
 * Helpers de fechas con zona horaria Atlantic/Canary FIJA.
 *
 * Por que existe este modulo:
 *   La app vive en Gran Canaria pero el host Windows del servicio puede tener
 *   configurada cualquier zona horaria del sistema (Europe/Madrid es el
 *   default en muchas instalaciones peninsulares). Si construimos las fechas
 *   con `new Date(year, month-1, day, hh, mm)` el runtime de Node las
 *   interpreta como hora LOCAL del proceso, que en Madrid esta +1 hora por
 *   delante de Canarias.
 *
 *   Las "Circulares Informativas" del PDF siempre indican hora canaria. Si
 *   el host estuviera en Madrid, "22:00" del PDF se almacenaria como las
 *   22:00 de Madrid (= 20:00 UTC) y al pintarlo en el navegador del operador
 *   (que SI esta en Canarias) saldria "21:00". De ahi el desfase de -1 hora.
 *
 *   Estas funciones eliminan esa ambiguedad: aceptan/devuelven horas como si
 *   el reloj estuviera en Atlantic/Canary, independientemente de la TZ del
 *   proceso. Asi quedamos a salvo aunque alguien arranque el servicio en una
 *   maquina con TZ peninsular o aunque la variable `TZ=Atlantic/Canary` del
 *   servicio NSSM no se haya aplicado todavia.
 */

const CANARY_TZ = "Atlantic/Canary";

/**
 * Devuelve el offset de Atlantic/Canary respecto a UTC, en milisegundos,
 * para el instante dado. Positivo cuando Canary va por delante de UTC.
 *
 * Implementacion: usamos `Intl.DateTimeFormat` con `timeZone: 'Atlantic/Canary'`
 * para extraer los componentes de fecha/hora locales en Canary, los volvemos
 * a UTC y comparamos contra el timestamp original. Es independiente de la TZ
 * del proceso y maneja DST automaticamente.
 */
function canaryOffsetMs(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CANARY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = pick("year");
  const mo = pick("month");
  const d = pick("day");
  // En Intl, "hour" puede ser 24 en lugar de 0 segun el ICU.
  let h = pick("hour");
  if (h === 24) h = 0;
  const mi = pick("minute");
  const s = pick("second");
  const asUtcMs = Date.UTC(y, mo - 1, d, h, mi, s);
  return asUtcMs - instant.getTime();
}

/**
 * Construye un `Date` cuyo instante UTC corresponde a la hora canaria
 * indicada (year/month/day hour:minute con timezone Atlantic/Canary).
 *
 * Ejemplo: `dateInCanary(2026, 5, 24, 22, 0)` produce un Date que, formateado
 * en Atlantic/Canary, dice "24/05/2026 22:00", independientemente de la TZ
 * del proceso.
 *
 * @param year     ano de 4 cifras
 * @param month    mes 1-12 (no 0-11)
 * @param day      dia 1-31
 * @param hour     hora 0-23
 * @param minute   minuto 0-59
 */
export function dateInCanary(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  // 1) Construimos un "naive UTC" asumiendo que la hora ya es UTC.
  //    Este timestamp coincidiria con la hora deseada solo si el offset
  //    Canary fuera 0; en DST hay +1h que tenemos que descontar.
  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  // 2) Calculamos el offset Canary en ESE instante (resuelve DST por nosotros).
  const offset = canaryOffsetMs(naive);

  // 3) Si Canary va +1h respecto a UTC, el timestamp real debe ser 1h ANTES
  //    del naive UTC; de ahi la resta.
  return new Date(naive.getTime() - offset);
}

/**
 * Devuelve un Date con la misma fecha (year, month, day) que `base` (medido
 * en Atlantic/Canary) pero con la hora `hour:minute` canaria. Util cuando
 * tienes un dia base ya en TZ Canary y solo quieres cambiar la hora.
 */
export function withCanaryTime(base: Date, hour: number, minute: number): Date {
  const parts = canaryParts(base);
  return dateInCanary(parts.year, parts.month, parts.day, hour, minute);
}

export type CanaryParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Extrae los componentes Y/M/D h:m:s de un `Date` en Atlantic/Canary. */
export function canaryParts(d: Date): CanaryParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CANARY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(d);
  const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = pick("hour");
  if (hour === 24) hour = 0;
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour,
    minute: pick("minute"),
    second: pick("second"),
  };
}

/** Suma `days` dias civiles en Atlantic/Canary (sin desfase por DST). */
export function addCanaryDays(d: Date, days: number): Date {
  const p = canaryParts(d);
  return dateInCanary(p.year, p.month, p.day + days, p.hour, p.minute);
}

/** Devuelve `"HH:MM"` en hora canaria. */
export function formatCanaryHHMM(d: Date): string {
  const p = canaryParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Devuelve `"dd/MM/yyyy"` en fecha canaria. */
export function formatCanaryDate(d: Date): string {
  const p = canaryParts(d);
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}`;
}

/** Formatea con `Intl` forzando timeZone canaria (resto de opciones libres). */
export function formatCanary(
  d: Date,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat("es-ES", { ...opts, timeZone: CANARY_TZ }).format(d);
}

export const CANARY_TIMEZONE = CANARY_TZ;
