/**
 * Tipos compartidos del dominio "Desvios".
 *
 * El servidor traduce entre los enums de Prisma (que coinciden 1:1) y estos
 * literales; los componentes de cliente trabajan siempre con estos tipos para
 * no depender del paquete `@prisma/client` en el bundle del navegador.
 */

export type DesvioSentido = "IDA" | "VUELTA" | "AMBOS";

export type DesvioEstado = "PENDIENTE" | "ACTIVO" | "RESUELTO" | "CANCELADO";

export type DesvioOrigen = "EMAIL" | "MANUAL";

export type ParadaDesvio = {
  nombre: string;
  codigo: string;
};

/**
 * Resultado del parseo de un PDF "Circular Informativa". Una sola circular
 * puede afectar a varios dias del calendario; en ese caso el parser principal
 * (`parsearCircularPDF`) devuelve siempre el primer dia y el helper
 * `parsearCircularPDFTodosLosDias` se encarga de iterar.
 */
export interface DesvioParseado {
  referencia: string;
  entorno: string;
  titulo: string;
  via: string;
  tramo: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  hora_fin_estimada: boolean;
  motivo: string;
  sentido: DesvioSentido;
  lineas_afectadas: string[];
  url_itinerario: string | null;
  paradas_fuera: ParadaDesvio[];
  paradas_alternativas: ParadaDesvio[];
}

/**
 * Vista "ligera" del desvio para listados (todo serializado a tipos primitivos
 * para que viaje seguro por JSON sin perder informacion en el cliente).
 */
export type DesvioResumen = {
  id: string;
  referencia: string;
  titulo: string;
  via: string;
  tramo: string;
  fecha_inicio: string;
  fecha_fin: string;
  hora_fin_estimada: boolean;
  motivo: string;
  sentido: DesvioSentido;
  lineas_afectadas: string[];
  estado: DesvioEstado;
  origen: DesvioOrigen;
  url_itinerario: string | null;
  pdf_path: string | null;
  creado_en: string;
  actualizado_en: string;
  confirmado_por: string | null;
  confirmado_en: string | null;
};

export type DesvioDetalle = DesvioResumen & {
  entorno: string;
  email_origen_id: string | null;
  notas: string | null;
  paradas_fuera: ParadaDesvio[];
  paradas_alternativas: ParadaDesvio[];
};
