export type FleetKpi = {
  label: string;
  value: string;
  trend: string;
  tone: "neutral" | "success" | "critical";
};

export type TicketState = "Abierto" | "En Proceso" | "Esperando Repuesto" | "Resuelto";

export type IncidentTicket = {
  id: string;
  bus: string;
  operator: string;
  municipio: string;
  equipo: "Validadora" | "SAE" | "Router" | "Pantalla";
  estado: TicketState;
  prioridad: "Alta" | "Media" | "Baja";
  slaMinutes: number;
};

export const fleetKpis: FleetKpi[] = [
  { label: "Tickets Abiertos", value: "28", trend: "+6 en 24h", tone: "critical" },
  { label: "Disponibilidad Flota", value: "93.4%", trend: "+1.2% semanal", tone: "success" },
  { label: "MTTR", value: "2h 18m", trend: "-14m vs objetivo", tone: "success" },
  { label: "SLA Cumplido", value: "88%", trend: "-3% último turno", tone: "neutral" },
];

export const activeIncidents: IncidentTicket[] = [
  {
    id: "INC-2401",
    bus: "GC-117",
    operator: "Global",
    municipio: "Las Palmas de Gran Canaria",
    equipo: "Validadora",
    estado: "En Proceso",
    prioridad: "Alta",
    slaMinutes: 45,
  },
  {
    id: "INC-2402",
    bus: "GUA-032",
    operator: "Guaguas Municipales",
    municipio: "Telde",
    equipo: "Router",
    estado: "Esperando Repuesto",
    prioridad: "Media",
    slaMinutes: 120,
  },
  {
    id: "INC-2403",
    bus: "SBT-088",
    operator: "Salcai-Utinsa",
    municipio: "Maspalomas",
    equipo: "SAE",
    estado: "Abierto",
    prioridad: "Alta",
    slaMinutes: 30,
  },
  {
    id: "INC-2404",
    bus: "SBT-091",
    operator: "Salcai-Utinsa",
    municipio: "Arucas",
    equipo: "Pantalla",
    estado: "Resuelto",
    prioridad: "Baja",
    slaMinutes: 0,
  },
];

export const knowledgeShortcuts = [
  "Reinicio seguro de validadora Conduent V3",
  "Diagnóstico de pérdida de señal en router Teltonika",
  "Checklist SAE sin telemetría en cabecera",
  "Sustitución de pantalla TFT en línea urbana",
];

export type BusRecord = {
  id: string;
  operator: string;
  municipio: string;
  lineas: string[];
};

export type HardwareAsset = {
  id: string;
  busId: string;
  type: "validadora" | "sae" | "router" | "pantalla";
  serialNumber: string;
};

export const buses: BusRecord[] = [
  {
    id: "GC-117",
    operator: "Global",
    municipio: "Las Palmas de Gran Canaria",
    lineas: ["1", "12", "26"],
  },
  {
    id: "GUA-032",
    operator: "Guaguas Municipales",
    municipio: "Telde",
    lineas: ["11", "20"],
  },
  {
    id: "SBT-088",
    operator: "Salcai-Utinsa",
    municipio: "Maspalomas",
    lineas: ["30", "36", "90"],
  },
  {
    id: "SBT-091",
    operator: "Salcai-Utinsa",
    municipio: "Arucas",
    lineas: ["103"],
  },
];

export const hardwareAssets: HardwareAsset[] = [
  { id: "VAL-117-A", busId: "GC-117", type: "validadora", serialNumber: "VLD-99112" },
  { id: "SAE-117-A", busId: "GC-117", type: "sae", serialNumber: "SAE-45001" },
  { id: "RTR-032-B", busId: "GUA-032", type: "router", serialNumber: "RTK-21089" },
  { id: "PAN-088-A", busId: "SBT-088", type: "pantalla", serialNumber: "DSP-19002" },
  { id: "VAL-091-A", busId: "SBT-091", type: "validadora", serialNumber: "VLD-88710" },
];
