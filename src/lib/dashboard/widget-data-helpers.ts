import type { CustomDashboardData } from "@/lib/dashboard/dashboard-data-types";

type Row = Record<string, string | number>;

/** Obtiene filas de datos para una fuente analítica del payload del dashboard. */
export function getAnalyticsRows(data: CustomDashboardData, dataSource: string): Row[] {
  if (dataSource === "manual") return [];
  if (dataSource.startsWith("kpi_") || dataSource.startsWith("embed_") || dataSource === "operation_links") {
    return [];
  }

  const key = dataSource as keyof CustomDashboardData;
  const raw = data[key];
  if (!Array.isArray(raw)) return [];

  if (dataSource === "tickets_trend") {
    return (raw as CustomDashboardData["tickets_trend"]).map((row) => ({
      name: row.day,
      day: row.day,
      value: row.creados,
      creados: row.creados,
      resueltos: row.resueltos,
    }));
  }

  if (dataSource === "sla_compliance") {
    return (raw as CustomDashboardData["sla_compliance"]).map((row) => ({
      name: row.day,
      day: row.day,
      value: row.cumplido,
      cumplido: row.cumplido,
      incumplido: row.incumplido,
    }));
  }

  return raw as Row[];
}

export function getEntryLabel(entry: Row) {
  return String(entry.day ?? entry.name ?? "");
}

export function buildMultiSeriesData(sourceData: Row[], dataSource: string) {
  return sourceData.map((entry) => {
    const baseLabel = getEntryLabel(entry);

    if (dataSource === "tickets_trend") {
      return {
        name: baseLabel,
        serieA: Number(entry.creados ?? 0),
        serieB: Number(entry.resueltos ?? 0),
        serieC: 0,
      };
    }

    if (dataSource === "sla_compliance") {
      return {
        name: baseLabel,
        serieA: Number(entry.cumplido ?? 0),
        serieB: Number(entry.incumplido ?? 0),
        serieC: 0,
      };
    }

    const mainValue = Number(entry.value ?? 0);
    return {
      name: baseLabel,
      serieA: Math.max(0, mainValue),
      serieB: 0,
      serieC: 0,
    };
  });
}

export function buildNumericValues(sourceData: Row[], dataSource: string) {
  return sourceData.map((entry) => {
    if (dataSource === "sla_compliance") return Number(entry.cumplido ?? 0);
    if (dataSource === "tickets_trend") return Number(entry.creados ?? entry.value ?? 0);
    const raw = entry.value ?? 0;
    const value = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(value) ? value : 0;
  });
}

export function isMultiSeriesSource(dataSource: string) {
  return dataSource === "sla_compliance" || dataSource === "tickets_trend";
}

export function isTicketDistributionSource(dataSource: string) {
  return (
    dataSource === "tickets_by_status" ||
    dataSource === "backlog_by_status" ||
    dataSource === "tickets_by_operator" ||
    dataSource === "tickets_by_priority" ||
    dataSource === "tickets_by_municipio" ||
    dataSource === "top_buses" ||
    dataSource === "shift_load_today"
  );
}

export const QUICK_DATA_SOURCES = [
  { id: "backlog_by_status", label: "Backlog" },
  { id: "tickets_trend", label: "Tendencia" },
  { id: "kpi_open_tickets", label: "KPI Abiertos" },
  { id: "tickets_by_priority", label: "Prioridad" },
  { id: "sla_compliance", label: "SLA" },
  { id: "embed_tickets", label: "Bandeja" },
] as const;

export function getEmptyStateBySource(dataSource: string) {
  if (dataSource.startsWith("kpi_")) {
    return { title: "KPI sin valor disponible.", action: "Actualiza los datos del dashboard." };
  }
  if (dataSource === "tickets_trend") {
    return {
      title: "Sin actividad en el periodo.",
      action: "Amplía el rango de días o espera a que se registren tickets.",
    };
  }
  if (dataSource === "backlog_by_status") {
    return { title: "No hay tickets activos.", action: "Buena señal: backlog vacío." };
  }
  if (dataSource === "tickets_by_status") {
    return {
      title: "Sin tickets creados en el periodo.",
      action: "Amplía el rango temporal con el selector superior.",
    };
  }
  if (dataSource === "tickets_by_municipio" || dataSource === "top_buses") {
    return { title: "Sin datos para el ranking.", action: "Prueba con un periodo más largo." };
  }
  if (dataSource === "sla_compliance") {
    return {
      title: "Sin resoluciones en el periodo.",
      action: "El SLA diario requiere tickets resueltos en cada día.",
    };
  }
  if (dataSource === "manual") {
    return {
      title: "No hay datos manuales configurados.",
      action: "Añade un JSON válido en la configuración del widget.",
    };
  }
  return {
    title: "Sin datos para la fuente seleccionada.",
    action: "Cambia la fuente o amplía el periodo del dashboard.",
  };
}

export const CHART_TYPE_LABELS: Record<string, string> = {
  kpi: "KPI",
  area: "Área",
  bar: "Barras",
  stacked_bar: "Barras apiladas",
  bar_horizontal: "Barras horizontales",
  pie: "Donut",
  rose: "Rosa polar",
  line: "Líneas",
  stacked_area: "Área apilada",
  composed: "Compuesta",
  radar: "Radar",
  radialbar: "Barras radiales",
  scatter: "Dispersión",
  bubble: "Burbujas",
  treemap: "Treemap",
  sankey: "Sankey",
  funnel: "Embudo",
};

export const CHART_TYPE_ICONS: Record<string, string> = {
  kpi: "123",
  bar: "▊▊▊",
  stacked_bar: "▇▅▃",
  bar_horizontal: "≡≡",
  line: "∿∿",
  stacked_area: "◨◧",
  area: "◭◭",
  pie: "◎",
  rose: "✿",
  composed: "▊∿",
  radar: "⬡",
  radialbar: "◉",
  scatter: "∴∵",
  bubble: "◌◍",
  treemap: "▦",
  sankey: "⇉",
  funnel: "▽",
};
