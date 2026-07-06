/**
 * Textos de ayuda para cada «Tipo» de la tipología CCMGC.
 * Orientan al usuario al crear o clasificar incidencias.
 */
export const TIPO_HELP: Record<string, string> = {
  "Estado general":
    "Estado del sistema a bordo: encendido/apagado, resets, pantalla táctil, software del pupitre, hora y claves.",
  Comunicaciones:
    "Conectividad del vehículo con la central: router, WiFi, fonia, alarmas de red y pérdida de comunicación.",
  Localizacion:
    "Posicionamiento del bus: GPS, antena, odómetro y errores de localización en mapa o central.",
  Billetaje:
    "Validadoras, EMV, tarjetas y cobro: fallos de validación, comunicaciones de validadora o operativa de billete.",
  Impresion: "Impresora de tickets y recibos: falta de papel, atascos o errores de impresión.",
  Planificacion:
    "Servicios y viajes asignados al bus: servicio no cargado, viaje equivocado, adelantos/atrasos o vigencias.",
  Operativa:
    "Uso operativo por conductor o centro: puertas, inicios prematuros, formación y errores humanos en servicio.",
  Desvios:
    "Itinerarios y desvíos de línea: desvío no cargado, fuera de horario o cambios automáticos de línea.",
  Generica:
    "Cuando ningún otro tipo encaja. Describe bien el caso en título y descripción; un técnico podrá reclasificarlo.",
};

export function getTipoHelp(tipo: string): string | null {
  return TIPO_HELP[tipo] ?? null;
}

/** Lista ordenada para la guía desplegable del formulario. */
export function listTipoHelpEntries(): { tipo: string; help: string }[] {
  return Object.entries(TIPO_HELP)
    .map(([tipo, help]) => ({ tipo, help }))
    .sort((a, b) => {
      if (a.tipo === "Generica") return 1;
      if (b.tipo === "Generica") return -1;
      return a.tipo.localeCompare(b.tipo, "es");
    });
}
