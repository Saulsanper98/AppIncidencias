import type { AssetType, TicketPriority, TicketStatus } from "@/lib/domain";
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/ticket-labels";

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  validadora: "Validadora",
  sae: "SAE",
  router: "Router",
  pantalla: "Pantalla",
};

export type BiTicketSource = {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  tipo: string | null;
  subtipo: string | null;
  subsubtipo: string | null;
  dominio: string | null;
  nivelImpacto: string | null;
  lineaLabel: string | null;
  servicioLabel: string | null;
  conductorLabel: string | null;
  serviceStopped: boolean;
  impactedLines: number;
  slaDeadline: Date;
  incidentOccurredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  needsCompletion: boolean;
  latitude: number | null;
  longitude: number | null;
  mapPlaceMunicipio: string | null;
  busId: string;
  bus: { operator: string; municipio: string };
  asset: { type: AssetType };
  assignedTo: { name: string } | null;
};

export type BiTicketRow = {
  id: string;
  referencia: string;
  titulo: string;
  descripcion: string;
  estado: string;
  prioridad: string;
  criticidad: string;
  operadora: string;
  vehiculo: string;
  municipio: string;
  tipo: string;
  subtipo: string;
  incidencia: string;
  tipologia: string;
  dominio: string;
  impacto: string;
  activo: string;
  linea: string;
  servicio: string;
  conductor: string;
  asignado_a: string;
  servicio_detenido: boolean;
  lineas_impactadas: number;
  sla_limite: string;
  sla_vencido: boolean;
  hora_incidencia: string | null;
  creado: string;
  actualizado: string;
  resuelto: string | null;
  horas_gestion: number | null;
  horas_afeccion_servicio: number | null;
  pendiente_completar: boolean;
  latitud: number | null;
  longitud: number | null;
};

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

function hoursBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

function tipologia(tipo: string | null, subtipo: string | null, subsubtipo: string | null): string {
  return [tipo, subtipo, subsubtipo].filter(Boolean).join(" · ") || "—";
}

export function mapTicketToBiRow(t: BiTicketSource, now = new Date()): BiTicketRow {
  const resolvedEnd = t.resolvedAt ?? (t.status === "resuelto" ? t.updatedAt : null);
  const horas_gestion = resolvedEnd ? hoursBetween(t.createdAt, resolvedEnd) : null;
  const horas_afeccion_servicio =
    t.serviceStopped && resolvedEnd
      ? hoursBetween(t.createdAt, resolvedEnd)
      : t.serviceStopped && t.status !== "resuelto"
        ? hoursBetween(t.createdAt, now)
        : null;

  return {
    id: t.id,
    referencia: t.id.slice(-8).toUpperCase(),
    titulo: t.title,
    descripcion: t.description,
    estado: TICKET_STATUS_LABELS[t.status] ?? t.status,
    prioridad: t.priority,
    criticidad: TICKET_PRIORITY_LABELS[t.priority] ?? t.priority,
    operadora: t.bus.operator,
    vehiculo: t.busId,
    municipio: t.mapPlaceMunicipio?.trim() || t.bus.municipio,
    tipo: t.tipo ?? "",
    subtipo: t.subtipo ?? "",
    incidencia: t.subsubtipo ?? "",
    tipologia: tipologia(t.tipo, t.subtipo, t.subsubtipo),
    dominio: t.dominio ?? "",
    impacto: t.nivelImpacto ?? "",
    activo: ASSET_TYPE_LABELS[t.asset.type] ?? t.asset.type,
    linea: t.lineaLabel ?? "",
    servicio: t.servicioLabel ?? "",
    conductor: t.conductorLabel ?? "",
    asignado_a: t.assignedTo?.name ?? "",
    servicio_detenido: t.serviceStopped,
    lineas_impactadas: t.impactedLines,
    sla_limite: iso(t.slaDeadline)!,
    sla_vencido: t.status !== "resuelto" && t.slaDeadline.getTime() < now.getTime(),
    hora_incidencia: iso(t.incidentOccurredAt),
    creado: iso(t.createdAt)!,
    actualizado: iso(t.updatedAt)!,
    resuelto: iso(resolvedEnd),
    horas_gestion,
    horas_afeccion_servicio,
    pendiente_completar: t.needsCompletion,
    latitud: t.latitude,
    longitud: t.longitude,
  };
}
