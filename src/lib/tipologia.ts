export type NivelImpacto = "Alto" | "Medio" | "Bajo";

export type TipologiaItem = {
  tipo: string;
  subtipo: string;
  subsubtipo: string;
  dominio: string;
  nivelImpacto: NivelImpacto;
  origenTecnico: string;
  observaciones: string;
};

/**
 * Catálogo alineado con CCMGC-PRO-OPS-INC-2026-V1 §3.6.
 * Nomenclatura sin tildes donde ya se usaba en la app (Localizacion, Incorrecto…).
 * Entradas propias de la app anteriores (Reset GPS, EMV 06, Formacion…) eliminadas del catálogo activo.
 */
export const TIPOLOGIA_CSV: TipologiaItem[] = [
  // ── 3.6.1 Estado general ───────────────────────────────────────────────────
  { tipo: "Estado general", subtipo: "No comunica", subsubtipo: "Sistema no comunica", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Software", observaciones: "Estado CUBE" },
  { tipo: "Estado general", subtipo: "No comunica", subsubtipo: "Fallo en el encendido", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Hardware", observaciones: "Estado CUBE" },
  { tipo: "Estado general", subtipo: "No comunica", subsubtipo: "Panel Tactil no responde", dominio: "Sistema", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "Pantalla" },
  { tipo: "Estado general", subtipo: "Apagado", subsubtipo: "Apagado", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Energia", observaciones: "" },
  { tipo: "Estado general", subtipo: "Apagado", subsubtipo: "Apagado abrupto", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Energia", observaciones: "" },
  { tipo: "Estado general", subtipo: "Apagado", subsubtipo: "Visor apagado", dominio: "Sistema", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Estado general", subtipo: "Reset/Bloqueo", subsubtipo: "Reset", dominio: "Sistema", nivelImpacto: "Medio", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Reset/Bloqueo", subsubtipo: "Reset forzado", dominio: "Sistema", nivelImpacto: "Medio", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Reset/Bloqueo", subsubtipo: "Reset no controlado", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Reset/Bloqueo", subsubtipo: "Bloqueo", dominio: "Sistema", nivelImpacto: "Medio", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Software", subsubtipo: "Error Tarea Pupitre", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Software", subsubtipo: "Componente actualizado", dominio: "Sistema", nivelImpacto: "Bajo", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Software", subsubtipo: "Actualizacion de Componentes", dominio: "Sistema", nivelImpacto: "Bajo", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Software", subsubtipo: "Sin claves", dominio: "Sistema", nivelImpacto: "Bajo", origenTecnico: "Configuracion", observaciones: "" },

  // ── 3.6.2 Comunicaciones ─────────────────────────────────────────────────────
  { tipo: "Comunicaciones", subtipo: "Informativo", subsubtipo: "Alarma Comunicaciones", dominio: "Comunicaciones", nivelImpacto: "Bajo", origenTecnico: "Red", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "Informativo", subsubtipo: "Alarma Paquetes", dominio: "Comunicaciones", nivelImpacto: "Bajo", origenTecnico: "Red", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "Informativo", subsubtipo: "Paneles", dominio: "Comunicaciones", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "No comunica", subsubtipo: "Vehiculo no comunica", dominio: "Comunicaciones", nivelImpacto: "Alto", origenTecnico: "Red", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "No comunica", subsubtipo: "Fonia sin comunicacion", dominio: "Comunicaciones", nivelImpacto: "Medio", origenTecnico: "Red", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "Reset", subsubtipo: "Reset router", dominio: "Comunicaciones", nivelImpacto: "Medio", origenTecnico: "Red", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "Reset", subsubtipo: "Reset WiFi", dominio: "Comunicaciones", nivelImpacto: "Medio", origenTecnico: "Red", observaciones: "" },

  // ── 3.6.3 Localizacion ───────────────────────────────────────────────────────
  { tipo: "Localizacion", subtipo: "Informativo", subsubtipo: "Averia odometro", dominio: "Localizacion", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Localizacion", subtipo: "Informativo", subsubtipo: "Averia cuentakilometros", dominio: "Localizacion", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Localizacion", subtipo: "Error", subsubtipo: "Error GPS", dominio: "Localizacion", nivelImpacto: "Alto", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Localizacion", subtipo: "Error", subsubtipo: "Error antena GPS", dominio: "Localizacion", nivelImpacto: "Alto", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Localizacion", subtipo: "Error", subsubtipo: "No posiciona Correctamente", dominio: "Localizacion", nivelImpacto: "Alto", origenTecnico: "Software", observaciones: "" },

  // ── 3.6.4 Billetaje ──────────────────────────────────────────────────────────
  { tipo: "Billetaje", subtipo: "Informativo", subsubtipo: "Estado EMV", dominio: "Billetaje", nivelImpacto: "Bajo", origenTecnico: "Software", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Informativo", subsubtipo: "Validadora sin comunicaciones", dominio: "Billetaje", nivelImpacto: "Alto", origenTecnico: "Comunicaciones", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Informativo", subsubtipo: "Reinicio no solicitado validadora", dominio: "Billetaje", nivelImpacto: "Medio", origenTecnico: "Software", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Informativo", subsubtipo: "Tarjeta no detectada", dominio: "Billetaje", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Apagado", subsubtipo: "Validadora inactiva", dominio: "Billetaje", nivelImpacto: "Alto", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Error", subsubtipo: "Zona destino no valida", dominio: "Billetaje", nivelImpacto: "Alto", origenTecnico: "Datos", observaciones: "Critico" },
  { tipo: "Billetaje", subtipo: "Error", subsubtipo: "Sin operatividad EMV", dominio: "Billetaje", nivelImpacto: "Alto", origenTecnico: "Software", observaciones: "" },

  // ── 3.6.8 Impresion ──────────────────────────────────────────────────────────
  { tipo: "Impresion", subtipo: "Estado del papel", subsubtipo: "Falta papel", dominio: "Impresion", nivelImpacto: "Bajo", origenTecnico: "Operativo", observaciones: "" },
  { tipo: "Impresion", subtipo: "Estado del papel", subsubtipo: "Cambio de rollo de papel", dominio: "Impresion", nivelImpacto: "Bajo", origenTecnico: "Operativo", observaciones: "" },
  { tipo: "Impresion", subtipo: "Error", subsubtipo: "Error impresora", dominio: "Impresion", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Impresion", subtipo: "Error", subsubtipo: "Atasco de papel", dominio: "Impresion", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "" },

  // ── 3.6.5 Planificacion ──────────────────────────────────────────────────────
  { tipo: "Planificacion", subtipo: "No asignado", subsubtipo: "Servicio no asignado", dominio: "Planificacion", nivelImpacto: "Alto", origenTecnico: "Datos", observaciones: "Intensificacion" },
  { tipo: "Planificacion", subtipo: "No asignado", subsubtipo: "Fleco/Refuerzo", dominio: "Planificacion", nivelImpacto: "Alto", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Incorrecto", subsubtipo: "Servicio equivocado", dominio: "Planificacion", nivelImpacto: "Alto", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Incorrecto", subsubtipo: "Viaje adelantado", dominio: "Planificacion", nivelImpacto: "Medio", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Incorrecto", subsubtipo: "Viaje atrasado", dominio: "Planificacion", nivelImpacto: "Medio", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Incorrecto", subsubtipo: "Viaje no registrado", dominio: "Planificacion", nivelImpacto: "Alto", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Incorrecto", subsubtipo: "Servicio desconocido", dominio: "Planificacion", nivelImpacto: "Bajo", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Vigencia", subsubtipo: "Servicio festivo no cargado", dominio: "Planificacion", nivelImpacto: "Medio", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Vigencia", subsubtipo: "Servicio no cargado", dominio: "Planificacion", nivelImpacto: "Medio", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Intercambio", subsubtipo: "Cambio entre conductores", dominio: "Planificacion", nivelImpacto: "Bajo", origenTecnico: "Operativo", observaciones: "" },

  // ── 3.6.6 Operativa ──────────────────────────────────────────────────────────
  { tipo: "Operativa", subtipo: "Uso incorrecto", subsubtipo: "Hora adelantada", dominio: "Operativa", nivelImpacto: "Bajo", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Uso incorrecto", subsubtipo: "Hora atrasada", dominio: "Operativa", nivelImpacto: "Bajo", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Uso incorrecto", subsubtipo: "Uso indebido", dominio: "Operativa", nivelImpacto: "Medio", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Uso incorrecto", subsubtipo: "Secuencia operativa incorrecta", dominio: "Operativa", nivelImpacto: "Medio", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Uso incorrecto", subsubtipo: "Encierro", dominio: "Operativa", nivelImpacto: "Medio", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Inicio de sesion", subsubtipo: "Inicio prematuro", dominio: "Operativa", nivelImpacto: "Medio", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Inicio de sesion", subsubtipo: "Inicio en intensificacion", dominio: "Operativa", nivelImpacto: "Medio", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Inicio de sesion", subsubtipo: "Identificacion incorrecta del conductor", dominio: "Operativa", nivelImpacto: "Medio", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Error operativo", subsubtipo: "Cambio manual incorrecto", dominio: "Operativa", nivelImpacto: "Medio", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Cambio manual de viaje", subsubtipo: "Cambio manual", dominio: "Operativa", nivelImpacto: "Medio", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Duda", subsubtipo: "Duda", dominio: "Operativa", nivelImpacto: "Bajo", origenTecnico: "Humano", observaciones: "" },

  // ── 3.6.7 Desvios ────────────────────────────────────────────────────────────
  { tipo: "Desvios", subtipo: "Configuracion incorrecta", subsubtipo: "Desvio no cargado", dominio: "Itinerario", nivelImpacto: "Alto", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Desvios", subtipo: "Configuracion incorrecta", subsubtipo: "Desvio sobrevenido", dominio: "Itinerario", nivelImpacto: "Alto", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Desvios", subtipo: "Activacion incorrecta", subsubtipo: "Desvio fuera de horario", dominio: "Itinerario", nivelImpacto: "Medio", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Desvios", subtipo: "Activacion incorrecta", subsubtipo: "Activacion no posible", dominio: "Itinerario", nivelImpacto: "Medio", origenTecnico: "Datos", observaciones: "" },

  // ── 3.6.9 Generica ───────────────────────────────────────────────────────────
  { tipo: "Generica", subtipo: "Generica", subsubtipo: "Incidencia generica", dominio: "General", nivelImpacto: "Medio", origenTecnico: "Otros", observaciones: "Caso no contemplado en el cuadro de tipologias." },
];

/** Clave estable para comparar entradas de tipología. */
export function tipologiaKey(item: Pick<TipologiaItem, "tipo" | "subtipo" | "subsubtipo">): string {
  return `${item.tipo}\0${item.subtipo}\0${item.subsubtipo}`;
}

/** Etiquetas estables para la opcion "Generica" (catch-all). */
export const GENERIC_TIPO = "Generica";
export const GENERIC_SUBTIPO = "Generica";
export const GENERIC_SUBSUBTIPO = "Incidencia generica";

export function findTipologiaBySubsubtipo(subsubtipo: string) {
  return TIPOLOGIA_CSV.find((item) => item.subsubtipo === subsubtipo) ?? null;
}

/** Devuelve la fila completa de la opcion "Generica" (siempre existe). */
export function getGenericTipologia(): TipologiaItem {
  const item = TIPOLOGIA_CSV.find((t) => t.subsubtipo === GENERIC_SUBSUBTIPO);
  if (!item) {
    throw new Error("Tipologia 'Generica' no esta definida en TIPOLOGIA_CSV.");
  }
  return item;
}
