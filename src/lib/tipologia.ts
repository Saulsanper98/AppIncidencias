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

export const TIPOLOGIA_CSV: TipologiaItem[] = [
  { tipo: "Estado general", subtipo: "No comunica", subsubtipo: "Sistema no comunica", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Software", observaciones: "Estado CUBE" },
  { tipo: "Estado general", subtipo: "No comunica", subsubtipo: "Fallo en el encendido", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Hardware", observaciones: "Estado CUBE" },
  { tipo: "Estado general", subtipo: "No comunica", subsubtipo: "Panel Tactil no responde", dominio: "Sistema", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "Pantalla" },
  { tipo: "Estado general", subtipo: "Apagado", subsubtipo: "Apagado", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Energia", observaciones: "" },
  { tipo: "Estado general", subtipo: "Apagado", subsubtipo: "Apagado abrupto", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Energia", observaciones: "" },
  { tipo: "Estado general", subtipo: "Apagado", subsubtipo: "Visor apagado", dominio: "Sistema", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Estado general", subtipo: "Reset/Bloqueo", subsubtipo: "Reset", dominio: "Sistema", nivelImpacto: "Medio", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Reset/Bloqueo", subsubtipo: "Reset forzado", dominio: "Sistema", nivelImpacto: "Medio", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Reset/Bloqueo", subsubtipo: "Reset no controlado", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Software", subsubtipo: "Error Tarea Pupitre", dominio: "Sistema", nivelImpacto: "Alto", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Software", subsubtipo: "Inicio Sesion", dominio: "Sistema", nivelImpacto: "Bajo", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Software", subsubtipo: "Componente actualizado", dominio: "Sistema", nivelImpacto: "Bajo", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Software", subsubtipo: "Actualizacion de Componentes", dominio: "Sistema", nivelImpacto: "Bajo", origenTecnico: "Software", observaciones: "" },
  { tipo: "Estado general", subtipo: "Software", subsubtipo: "Sin claves", dominio: "Sistema", nivelImpacto: "Bajo", origenTecnico: "Configuracion", observaciones: "" },
  { tipo: "Estado general", subtipo: "Software", subsubtipo: "Hora adelantada", dominio: "Sistema", nivelImpacto: "Bajo", origenTecnico: "Configuracion", observaciones: "" },
  { tipo: "Estado general", subtipo: "Software", subsubtipo: "Hora atrasada", dominio: "Sistema", nivelImpacto: "Bajo", origenTecnico: "Configuracion", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "Informativo", subsubtipo: "Alarma Comunicaciones", dominio: "Comunicaciones", nivelImpacto: "Bajo", origenTecnico: "Red", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "Informativo", subsubtipo: "Alarma Paquetes", dominio: "Comunicaciones", nivelImpacto: "Bajo", origenTecnico: "Red", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "No comunica", subsubtipo: "Vehiculo no comunica", dominio: "Comunicaciones", nivelImpacto: "Alto", origenTecnico: "Red", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "No comunica", subsubtipo: "Fonia sin comunicacion", dominio: "Comunicaciones", nivelImpacto: "Medio", origenTecnico: "Red", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "Reset", subsubtipo: "Reset router", dominio: "Comunicaciones", nivelImpacto: "Medio", origenTecnico: "Red", observaciones: "" },
  { tipo: "Comunicaciones", subtipo: "Reset", subsubtipo: "Reset WiFi", dominio: "Comunicaciones", nivelImpacto: "Medio", origenTecnico: "Red", observaciones: "" },
  { tipo: "Localizacion", subtipo: "Informativo", subsubtipo: "Averia odometro", dominio: "Localizacion", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Localizacion", subtipo: "Error", subsubtipo: "Error GPS", dominio: "Localizacion", nivelImpacto: "Alto", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Localizacion", subtipo: "Error", subsubtipo: "Error antena GPS", dominio: "Localizacion", nivelImpacto: "Alto", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Localizacion", subtipo: "Error", subsubtipo: "Reset GPS", dominio: "Localizacion", nivelImpacto: "Medio", origenTecnico: "Software", observaciones: "" },
  { tipo: "Localizacion", subtipo: "Error", subsubtipo: "No posiciona Correctamente", dominio: "Localizacion", nivelImpacto: "Alto", origenTecnico: "Software", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Informativo", subsubtipo: "Estado EMV", dominio: "Billetaje", nivelImpacto: "Bajo", origenTecnico: "Software", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Informativo", subsubtipo: "Validadora sin comunicaciones", dominio: "Billetaje", nivelImpacto: "Alto", origenTecnico: "Comunicaciones", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Informativo", subsubtipo: "Reinicio no solicitado validadora", dominio: "Billetaje", nivelImpacto: "Medio", origenTecnico: "Software", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Informativo", subsubtipo: "Tarjeta no detectada", dominio: "Billetaje", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Apagado", subsubtipo: "Validadora inactiva", dominio: "Billetaje", nivelImpacto: "Alto", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Error", subsubtipo: "Zona destino no valida", dominio: "Billetaje", nivelImpacto: "Alto", origenTecnico: "Datos", observaciones: "Critico" },
  { tipo: "Billetaje", subtipo: "Error", subsubtipo: "Sin operatividad EMV", dominio: "Billetaje", nivelImpacto: "Alto", origenTecnico: "Software", observaciones: "" },
  { tipo: "Billetaje", subtipo: "Error", subsubtipo: "EMV operativa incorrecta (06)", dominio: "Billetaje", nivelImpacto: "Alto", origenTecnico: "Software", observaciones: "" },
  { tipo: "Impresion", subtipo: "Informativo", subsubtipo: "Falta papel", dominio: "Billetaje", nivelImpacto: "Bajo", origenTecnico: "Operativo", observaciones: "" },
  { tipo: "Impresion", subtipo: "Error", subsubtipo: "Error impresora", dominio: "Billetaje", nivelImpacto: "Medio", origenTecnico: "Hardware", observaciones: "" },
  { tipo: "Planificacion", subtipo: "No asignado", subsubtipo: "Servicio no asignado", dominio: "Planificacion", nivelImpacto: "Alto", origenTecnico: "Datos", observaciones: "Intensificacion" },
  { tipo: "Planificacion", subtipo: "Incorrecto", subsubtipo: "Servicio equivocado", dominio: "Planificacion", nivelImpacto: "Alto", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Incorrecto", subsubtipo: "Viaje adelantado", dominio: "Planificacion", nivelImpacto: "Medio", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Incorrecto", subsubtipo: "Viaje atrasado", dominio: "Planificacion", nivelImpacto: "Medio", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Vigencia", subsubtipo: "Servicio festivo no cargado", dominio: "Planificacion", nivelImpacto: "Medio", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Planificacion", subtipo: "Intercambio", subsubtipo: "Cambio entre conductores", dominio: "Planificacion", nivelImpacto: "Bajo", origenTecnico: "Operativo", observaciones: "" },
  { tipo: "Operativa", subtipo: "Error operativo", subsubtipo: "Cambio manual indebido", dominio: "Operativa", nivelImpacto: "Medio", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Error operativo", subsubtipo: "No abrir/cerrar puertas", dominio: "Operativa", nivelImpacto: "Medio", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Error operativo", subsubtipo: "Inicio prematuro", dominio: "Operativa", nivelImpacto: "Medio", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Formacion", subsubtipo: "Servicio desconocido", dominio: "Operativa", nivelImpacto: "Bajo", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Operativa", subtipo: "Formacion", subsubtipo: "Apagado abrupto", dominio: "Operativa", nivelImpacto: "Bajo", origenTecnico: "Humano", observaciones: "" },
  { tipo: "Desvios", subtipo: "No configurado", subsubtipo: "Desvio no cargado", dominio: "Itinerario", nivelImpacto: "Alto", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Desvios", subtipo: "Activo incorrecto", subsubtipo: "Desvio fuera de horario", dominio: "Itinerario", nivelImpacto: "Medio", origenTecnico: "Datos", observaciones: "" },
  { tipo: "Desvios", subtipo: "Impacto en localizacion", subsubtipo: "Cambio automatico de linea", dominio: "Itinerario", nivelImpacto: "Alto", origenTecnico: "Sistema", observaciones: "" },
];

export function findTipologiaBySubsubtipo(subsubtipo: string) {
  return TIPOLOGIA_CSV.find((item) => item.subsubtipo === subsubtipo) ?? null;
}
