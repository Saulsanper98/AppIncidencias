/**
 * Textos en español para inventario (P3: un solo lugar para banner, tips, vacíos y toasts).
 * Las claves cortas facilitan buscar y revisar contraste / copy.
 */

export const inv = {
  a11y: {
    loadingRoot: "Cargando inventario",
    /** Región que se actualiza al refrescar (KPI + listado / análisis) */
    dataRegion: "Inventario: resumen y listado",
    searchInput: "Buscar repuestos",
    helpToggle: "Atajos y ayuda",
    dismissTipForever: "No volver a mostrar",
    listHeading: "Listado de repuestos",
    kpiHeading: "Resumen de inventario",
    tablist: "Vista de inventario",
    heatmapSection: "Análisis por tipo de activo",
    stockQuantities: "Cantidades de stock",
  },

  header: {
    title: "Inventario de repuestos",
    subtitle: "Stock operativo para validadoras, SAE, routers y pantallas",
    cacheBadgeTitle:
      "Petición fetch con cache: no-store (no caché del navegador en la recarga)",
    cacheBadge: "Sin caché",
  },

  errors: {
    loadFailed: "No se pudo cargar el inventario",
    fetchBody: "No se pudo cargar inventario",
  },

  toasts: {
    filtersReset: "Filtros restablecidos.",
    filtersMemoryCleared: "Memoria de filtros borrada (predeterminados).",
    codeCopied: "Código copiado al portapapeles.",
    codeCopyErr: "No se pudo copiar el código.",
    summaryCopied: "Resumen copiado al portapapeles.",
    summaryCopyErr: "No se pudo copiar el resumen.",
    inventoryUpdated: "Inventario actualizado.",
  },

  live: {
    critical: (n: number, bajos: number, agotados: number) =>
      `${n} alertas: ${bajos} bajo mínimo, ${agotados} agotados.`,
    ok: "Sin alertas de stock.",
  },

  banner: {
    titleSingle: "Alertas de stock: 1 referencia requiere atención",
    titlePlural: (n: number) => `Alertas de stock: ${n} referencias requieren atención`,
    body: (bajos: number, agotados: number, ok: number) =>
      `Resumen: ${bajos} bajo · ${agotados} agotado${agotados === 1 ? "" : "s"} · ${ok} OK · el chip «Bajo» indica libre bajo el umbral (no es agotado).`,
    cta: "Ver solo alertas",
  },

  tip: {
    title: "Cómo leer cobertura y reservas:",
    body:
      "Disponible son unidades libres para nuevas reservas. Reservado está comprometido en tickets. Cobertura % compara disponible frente al mínimo (puede superar 100%). La barra superior reparte físico; la inferior muestra cobertura con marca al 100 % del mínimo.",
    hide: "Ocultar",
    collapsed: "Ayuda sobre cobertura, reservas y barras.",
    show: "Mostrar ayuda",
  },

  help: {
    shortcuts: "Atajos",
    searchKey: "enfocar búsqueda",
    clearFiltersKey: "limpiar filtros",
    escapeControlRoom: "salir del modo sala de control (si está activo y el foco no está en un campo)",
    clearMemory: "Borrar memoria de filtros guardada",
    close: "Cerrar",
  },

  controlRoom: {
    enter: "Sala de control",
    exit: "Salir de sala",
    titleOn: "Barra lateral oculta y parrilla ampliada (hasta 6 columnas en pantallas grandes).",
    titleOff: "Activa vista ampliada sin barra lateral para monitorizar más referencias a la vez.",
  },

  emptyCatalog: {
    title: "Sin repuestos registrados",
    body:
      "El catálogo de inventario está vacío o aún no se ha sincronizado. Cuando haya piezas, verás cobertura frente al mínimo y reservas vinculadas a tickets.",
    tickets: "Ir a la bandeja de tickets",
    dashboard: "Volver al panel",
  },

  emptyFilter: {
    title: "Ninguna referencia coincide con los filtros.",
    body: "Prueba a limpiar búsqueda o tipos. (Guardar vista favorita: próximamente)",
    cta: "Limpiar filtros",
  },

  search: {
    placeholder: "Buscar por nombre, código o tipo… (/ para foco)",
  },

  kpi: {
    totalHint: "Clic: quitar filtros de estado",
    bajoHint: "Clic: filtrar solo bajo",
    agotadoHint: "Clic: filtrar agotados · 0 no es error",
  },

  card: {
    copyCodeTitle: "Copiar código de repuesto",
    copyCodeAria: (code: string) => `Copiar código ${code}`,
    physLine: (onHand: number, freeRatio: number, reservedRatio: number) =>
      `En almacén (físico): ${onHand} uds · libre ${freeRatio}% · reservado ${reservedRatio}%`,
    physBarLabel: "Físico: reservado / libre",
    minAbovePhys: "Mínimo por encima del físico: el umbral supera las unidades en almacén.",
    freeAllPhysical:
      "100 % del físico está libre; eso no implica cobertura al mínimo con stock disponible.",
    physMinTitle:
      "Todas las unidades en almacén (disponible + reservado) frente al mínimo. La cobertura principal usa solo «disponible».",
    physMinLine: (pct: number) =>
      `Físico / mínimo: ${pct}% (todas las uds en almacén vs mínimo)`,
    coverageBarLabel: (max: number) =>
      `Cobertura (libre vs mínimo, 0–${max} %; marca = 100 %)`,
    minMarkerOk: "Umbral del mínimo proyectado sobre el físico en almacén",
    minMarkerAbove: "Mínimo por encima del físico: la marca queda al 100 % del gráfico.",
    covTickTitle: "100 % del mínimo cubierto con stock libre",
    covLabel: "Cobertura del mínimo:",
    excess: (n: number) => `Exceso: +${n} uds sobre el mínimo`,
    deficit: (n: number) => `Faltan ${n} uds libres para alcanzar el mínimo`,
    ticketsFilteredTitle: "Tickets con reserva activa o consumida de este código de repuesto",
    ticketsWithCount: (n: number) => `Ver tickets con esta pieza (${n})`,
    ticketsNoCount: "Ver tickets con esta pieza",
    bandejaGeneral: "Ir a la bandeja general",
  },

  print: {
    intro: (params: {
      stamp: string;
      total: number;
      bajos: number;
      agotados: number;
      rows: number;
      filtered: boolean;
    }) =>
      `Inventario CCMGC · ${params.stamp} · Catálogo: ${params.total} ref. · Bajo: ${params.bajos} · Agotados: ${params.agotados} · Impresión: ${params.rows} fila${params.rows === 1 ? "" : "s"}${params.filtered ? " (vista filtrada)" : ""}`,
  },

  filters: {
    advancedOpen: "Ocultar filtros avanzados",
    advancedClosed: "Filtros avanzados",
    onlyReserved: "Solo con reserva > 0",
    coverage120: "Cobertura < 120 %",
    assetTypeLabel: "Tipo de activo",
    clearTypes: "Limpiar tipos",
  },

  tabs: { lista: "Lista", analisis: "Análisis" },

  dense: {
    ticketsLink: (n: number | undefined) => (typeof n === "number" ? `Ver (${n})` : "Ver tickets"),
  },
} as const;

export function invTransitionToast(partCode: string, to: "bajo" | "agotado"): string {
  if (to === "bajo") return `Pieza ${partCode} pasó de OK a bajo mínimo.`;
  return `Pieza ${partCode} pasó de OK a agotada (libre).`;
}

/**
 * P4 — pendientes de mayor alcance (backend / datos):
 * - Mínimo por almacén y reglas por referencia.
 * - Histórico 7 días, sparklines, borrador de pedidos de compras.
 */
