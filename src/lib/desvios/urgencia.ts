/**
 * Heuristica simple de "urgencia" para los desvios.
 *
 * Reglas pragmaticas (se pueden afinar segun feedback de los operadores):
 *   - "alta" si afecta a mas de una linea (impacto multiple), o si se
 *     desarrolla en horario diurno (06:00-22:00) y se solapa con punta.
 *   - "normal" en el resto de casos.
 *
 * Se usa en el SSE (`desvio_nuevo.payload.urgencia`) y en los chips de la UI.
 */

import { canaryParts } from "../datetime/canary";
import type { DesvioDetalle, DesvioResumen } from "./types";

export type DesvioUrgencia = "alta" | "normal";

/**
 * Calcula la urgencia a partir de los datos basicos del desvio. No depende
 * del estado para que el calculo sea consistente entre PENDIENTE/ACTIVO.
 */
export function calcularUrgencia(input: {
  lineas_afectadas: string[];
  fecha_inicio: Date | string;
  fecha_fin: Date | string;
}): DesvioUrgencia {
  const lineas = input.lineas_afectadas?.length ?? 0;
  const inicio = input.fecha_inicio instanceof Date ? input.fecha_inicio : new Date(input.fecha_inicio);
  const fin = input.fecha_fin instanceof Date ? input.fecha_fin : new Date(input.fecha_fin);

  // Multiples lineas afectadas → siempre alta.
  if (lineas > 1) return "alta";

  // Si dura mas de 6h y solapa con horario diurno (06:00-22:00) -> alta.
  // Calculamos las horas en TZ Atlantic/Canary para que el cierre nocturno se
  // detecte correctamente aunque el servidor corra en Europe/Madrid.
  const duracionHoras = (fin.getTime() - inicio.getTime()) / (1000 * 60 * 60);
  const pi = canaryParts(inicio);
  const pf = canaryParts(fin);
  const horaInicio = pi.hour;
  const cambioDia = pi.year !== pf.year || pi.month !== pf.month || pi.day !== pf.day;
  const horaFin = pf.hour + (cambioDia ? 24 : 0);
  const tocaDiurno = horaInicio < 22 && horaFin > 6;
  if (duracionHoras >= 6 && tocaDiurno) return "alta";

  return "normal";
}

/** Variante para `DesvioResumen`/`DesvioDetalle` (string ISO). */
export function urgenciaForResumen(d: DesvioResumen | DesvioDetalle): DesvioUrgencia {
  return calcularUrgencia({
    lineas_afectadas: d.lineas_afectadas,
    fecha_inicio: d.fecha_inicio,
    fecha_fin: d.fecha_fin,
  });
}
