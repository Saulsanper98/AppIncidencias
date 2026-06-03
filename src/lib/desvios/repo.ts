/**
 * Capa de acceso a datos del modulo Desvios.
 *
 * Toda interaccion con `prisma.desvio` pasa por aqui. El objetivo es:
 *   - Aislar el cliente Prisma (no se importa fuera de este modulo).
 *   - Encapsular el (de)serializado de los campos JSON-string (lineas y paradas).
 *   - Devolver objetos `DesvioDetalle` / `DesvioResumen` listos para el cliente.
 */

import { prisma } from "@/lib/prisma";
import { canaryParts } from "@/lib/datetime/canary";
import { publicUrlForPdfPath } from "@/lib/desvios/pdf-storage";
import {
  getLineas,
  getParadasFuera,
  getParadasAlt,
  serializeLineas,
  serializeParadas,
} from "@/lib/desvios/serializers";
import type {
  DesvioDetalle,
  DesvioEstado,
  DesvioOrigen,
  DesvioParseado,
  DesvioResumen,
  DesvioSentido,
  ParadaDesvio,
} from "@/lib/desvios/types";

type DesvioRecord = {
  id: string;
  referencia: string;
  entorno: string;
  titulo: string;
  via: string;
  tramo: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  hora_fin_estimada: boolean;
  sin_fecha_fin: boolean;
  motivo: string;
  sentido: DesvioSentido;
  lineas_afectadas: string;
  url_itinerario: string | null;
  paradas_fuera: string;
  paradas_alternativas: string;
  estado: DesvioEstado;
  origen: DesvioOrigen;
  email_origen_id: string | null;
  pdf_path: string | null;
  notas: string | null;
  creado_en: Date;
  actualizado_en: Date;
  confirmado_por: string | null;
  confirmado_en: Date | null;
};

// ---------- Mappers ---------------------------------------------------------

function toResumen(row: DesvioRecord): DesvioResumen {
  return {
    id: row.id,
    referencia: row.referencia,
    titulo: row.titulo,
    via: row.via,
    tramo: row.tramo,
    fecha_inicio: row.fecha_inicio.toISOString(),
    fecha_fin: row.fecha_fin.toISOString(),
    hora_fin_estimada: row.hora_fin_estimada,
    sin_fecha_fin: row.sin_fecha_fin,
    motivo: row.motivo,
    sentido: row.sentido,
    lineas_afectadas: getLineas(row),
    estado: row.estado,
    origen: row.origen,
    url_itinerario: row.url_itinerario,
    pdf_path: publicUrlForPdfPath(row.pdf_path),
    creado_en: row.creado_en.toISOString(),
    actualizado_en: row.actualizado_en.toISOString(),
    confirmado_por: row.confirmado_por,
    confirmado_en: row.confirmado_en ? row.confirmado_en.toISOString() : null,
  };
}

function toDetalle(row: DesvioRecord): DesvioDetalle {
  return {
    ...toResumen(row),
    entorno: row.entorno,
    email_origen_id: row.email_origen_id,
    notas: row.notas,
    paradas_fuera: getParadasFuera(row),
    paradas_alternativas: getParadasAlt(row),
  };
}

// ---------- Lectura ---------------------------------------------------------

export type DesvioListFilters = {
  estado?: DesvioEstado | "TODOS";
  sentido?: DesvioSentido | "TODOS";
  linea?: string;
  search?: string;
  desde?: Date;
  hasta?: Date;
  origen?: DesvioOrigen | "TODOS";
  page?: number;
  pageSize?: number;
};

export type DesvioListResult = {
  items: DesvioResumen[];
  total: number;
  page: number;
  pages: number;
  counts: Record<DesvioEstado, number>;
};

export async function listDesvios(filters: DesvioListFilters): Promise<DesvioListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 30));

  const where: Record<string, unknown> = {};
  if (filters.estado && filters.estado !== "TODOS") where.estado = filters.estado;
  if (filters.sentido && filters.sentido !== "TODOS") where.sentido = filters.sentido;
  if (filters.origen && filters.origen !== "TODOS") where.origen = filters.origen;
  if (filters.linea && filters.linea.trim().length > 0) {
    // Las lineas son JSON strings. Hacemos contains "comilla+linea+comilla" para
    // evitar falsos positivos (p.ej. "1" no debe matchear "10" o "100").
    where.lineas_afectadas = { contains: `"${filters.linea.trim()}"` };
  }
  if (filters.desde || filters.hasta) {
    where.fecha_inicio = {} as Record<string, Date>;
    if (filters.desde) (where.fecha_inicio as Record<string, Date>).gte = filters.desde;
    if (filters.hasta) (where.fecha_inicio as Record<string, Date>).lte = filters.hasta;
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim();
    where.OR = [
      { via: { contains: q } },
      { tramo: { contains: q } },
      { titulo: { contains: q } },
      { motivo: { contains: q } },
      { referencia: { contains: q } },
    ];
  }

  const desvioRepo = (prisma as unknown as { desvio: PrismaDesvioModel }).desvio;
  const [total, rows, grouped] = await Promise.all([
    desvioRepo.count({ where }),
    desvioRepo.findMany({
      where,
      // Ordenacion: PENDIENTE primero, luego fecha_inicio desc.
      orderBy: [
        // SQLite ordena enums alfabeticamente (ACTIVO, CANCELADO, PENDIENTE,
        // RESUELTO). Compensamos eso con un orderBy "manual" en cliente
        // despues de la query principal (ver abajo). Aqui solo aplicamos
        // fecha_inicio descendente para tener orden estable.
        { fecha_inicio: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    desvioRepo.groupBy({
      by: ["estado"],
      _count: { _all: true },
    }),
  ]);

  // Reordenamos en memoria para que PENDIENTE quede primero. Mantiene la
  // simplicidad de SQLite sin perder la UX del listado.
  const ESTADO_ORDER: Record<DesvioEstado, number> = {
    PENDIENTE: 0,
    ACTIVO: 1,
    RESUELTO: 2,
    CANCELADO: 3,
  };
  const sortedRows = [...rows].sort((a, b) => {
    const da = ESTADO_ORDER[a.estado];
    const db = ESTADO_ORDER[b.estado];
    if (da !== db) return da - db;
    return b.fecha_inicio.getTime() - a.fecha_inicio.getTime();
  });

  const counts: Record<DesvioEstado, number> = {
    PENDIENTE: 0,
    ACTIVO: 0,
    RESUELTO: 0,
    CANCELADO: 0,
  };
  for (const g of grouped) {
    counts[g.estado] = g._count?._all ?? 0;
  }

  return {
    items: sortedRows.map(toResumen),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  };
}

/** Cuenta de desvios "vivos" (PENDIENTE o ACTIVO) para el badge del sidebar. */
export async function countActiveDesvios(): Promise<{ pendientes: number; activos: number }> {
  const desvioRepo = (prisma as unknown as { desvio: PrismaDesvioModel }).desvio;
  const [pendientes, activos] = await Promise.all([
    desvioRepo.count({ where: { estado: "PENDIENTE" } }),
    desvioRepo.count({ where: { estado: "ACTIVO" } }),
  ]);
  return { pendientes, activos };
}

export async function getDesvioById(id: string): Promise<DesvioDetalle | null> {
  const desvioRepo = (prisma as unknown as { desvio: PrismaDesvioModel }).desvio;
  const row = await desvioRepo.findUnique({ where: { id } });
  return row ? toDetalle(row) : null;
}

export async function findDesvioByEmailId(emailOrigenId: string): Promise<DesvioRecord | null> {
  const desvioRepo = (prisma as unknown as { desvio: PrismaDesvioModel }).desvio;
  return desvioRepo.findFirst({ where: { email_origen_id: emailOrigenId } });
}

/**
 * Devuelve todos los desvios que comparten una `referencia`. Util para
 * deduplicar cuando el operador sube manualmente el mismo PDF (1 referencia
 * puede generar N desvios, uno por dia).
 */
export async function findDesviosByReferencia(
  referencia: string,
): Promise<{ id: string; fecha_inicio: Date }[]> {
  const desvioRepo = (prisma as unknown as { desvio: PrismaDesvioModel }).desvio;
  const rows = await desvioRepo.findMany({ where: { referencia } });
  return rows.map((r) => ({ id: r.id, fecha_inicio: r.fecha_inicio }));
}

// ---------- Escritura -------------------------------------------------------

export type ManualDesvioInput = {
  via: string;
  tramo: string;
  motivo: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  hora_fin_estimada?: boolean;
  sin_fecha_fin?: boolean;
  sentido: DesvioSentido;
  lineas_afectadas: string[];
  paradas_fuera?: ParadaDesvio[];
  paradas_alternativas?: ParadaDesvio[];
  notas?: string | null;
  url_itinerario?: string | null;
};

/**
 * Crea un Desvio MANUAL desde el formulario web. Genera una `referencia`
 * sintetica con marca temporal para distinguirlo de los del poller.
 */
export async function createManualDesvio(input: ManualDesvioInput): Promise<DesvioDetalle> {
  const ahora = new Date();
  const refDate = formatDDMMYYYY(ahora);
  const refTime = formatHHMM(ahora);
  const referencia = `(MAN) ${refDate} ${refTime}`;

  const desvioRepo = (prisma as unknown as { desvio: PrismaDesvioModel }).desvio;
  const row = await desvioRepo.create({
    data: {
      referencia,
      entorno: "PRODUCCION",
      titulo: composeTitulo(input.via, input.fecha_inicio),
      via: input.via,
      tramo: input.tramo,
      fecha_inicio: input.fecha_inicio,
      fecha_fin: input.fecha_fin,
      hora_fin_estimada: input.hora_fin_estimada ?? false,
      sin_fecha_fin: input.sin_fecha_fin ?? false,
      motivo: input.motivo,
      sentido: input.sentido,
      lineas_afectadas: serializeLineas(input.lineas_afectadas),
      url_itinerario: input.url_itinerario?.trim() || null,
      paradas_fuera: serializeParadas(input.paradas_fuera ?? []),
      paradas_alternativas: serializeParadas(input.paradas_alternativas ?? []),
      estado: "PENDIENTE",
      origen: "MANUAL",
      email_origen_id: null,
      pdf_path: null,
      notas: input.notas?.trim() || null,
    },
  });
  return toDetalle(row);
}

export async function createDesvioFromParsed(
  parsed: DesvioParseado,
  meta: {
    emailOrigenId: string | null;
    pdfPath: string | null;
    /**
     * Origen del desvio. Si se omite asume "EMAIL" (compat con el poller).
     * El endpoint de subida manual de PDF pasa "MANUAL".
     */
    origen?: DesvioOrigen;
    /** Notas iniciales (opcional, para uploads manuales con observaciones). */
    notas?: string | null;
  },
): Promise<DesvioDetalle> {
  const desvioRepo = (prisma as unknown as { desvio: PrismaDesvioModel }).desvio;
  const row = await desvioRepo.create({
    data: {
      referencia: parsed.referencia,
      entorno: parsed.entorno,
      titulo: parsed.titulo,
      via: parsed.via,
      tramo: parsed.tramo,
      fecha_inicio: parsed.fecha_inicio,
      fecha_fin: parsed.fecha_fin,
      hora_fin_estimada: parsed.hora_fin_estimada,
      motivo: parsed.motivo,
      sentido: parsed.sentido,
      lineas_afectadas: serializeLineas(parsed.lineas_afectadas),
      url_itinerario: parsed.url_itinerario ?? null,
      paradas_fuera: serializeParadas(parsed.paradas_fuera),
      paradas_alternativas: serializeParadas(parsed.paradas_alternativas),
      estado: "PENDIENTE",
      origen: meta.origen ?? "EMAIL",
      email_origen_id: meta.emailOrigenId,
      pdf_path: meta.pdfPath,
      notas: meta.notas?.trim() || null,
    },
  });
  return toDetalle(row);
}

export type DesvioPatch = Partial<{
  via: string;
  tramo: string;
  motivo: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  hora_fin_estimada: boolean;
  sin_fecha_fin: boolean;
  sentido: DesvioSentido;
  lineas_afectadas: string[];
  paradas_fuera: ParadaDesvio[];
  paradas_alternativas: ParadaDesvio[];
  notas: string | null;
  url_itinerario: string | null;
}>;

/**
 * Patch parcial de un desvio. Solo se permite cuando esta en estado PENDIENTE.
 * Lanza si no existe o no es editable; el caller debe controlar el 404/409.
 */
export async function patchDesvio(id: string, patch: DesvioPatch): Promise<DesvioDetalle> {
  const desvioRepo = (prisma as unknown as { desvio: PrismaDesvioModel }).desvio;
  const data: Record<string, unknown> = {};
  if (patch.via !== undefined) data.via = patch.via;
  if (patch.tramo !== undefined) data.tramo = patch.tramo;
  if (patch.motivo !== undefined) data.motivo = patch.motivo;
  if (patch.fecha_inicio !== undefined) data.fecha_inicio = patch.fecha_inicio;
  if (patch.fecha_fin !== undefined) data.fecha_fin = patch.fecha_fin;
  if (patch.hora_fin_estimada !== undefined) data.hora_fin_estimada = patch.hora_fin_estimada;
  if (patch.sin_fecha_fin !== undefined) data.sin_fecha_fin = patch.sin_fecha_fin;
  if (patch.sentido !== undefined) data.sentido = patch.sentido;
  if (patch.lineas_afectadas !== undefined) {
    data.lineas_afectadas = serializeLineas(patch.lineas_afectadas);
  }
  if (patch.paradas_fuera !== undefined) {
    data.paradas_fuera = serializeParadas(patch.paradas_fuera);
  }
  if (patch.paradas_alternativas !== undefined) {
    data.paradas_alternativas = serializeParadas(patch.paradas_alternativas);
  }
  if (patch.notas !== undefined) data.notas = patch.notas?.trim() || null;
  if (patch.url_itinerario !== undefined) data.url_itinerario = patch.url_itinerario?.trim() || null;

  const row = await desvioRepo.update({
    where: { id },
    data,
  });
  return toDetalle(row);
}

/** Cambia el estado y guarda quien lo confirma cuando aplica. */
export async function transitionDesvio(
  id: string,
  nuevoEstado: DesvioEstado,
  actor: { userId: string | null; displayName: string },
): Promise<DesvioDetalle> {
  const desvioRepo = (prisma as unknown as { desvio: PrismaDesvioModel }).desvio;
  const data: Record<string, unknown> = { estado: nuevoEstado };
  if (nuevoEstado === "ACTIVO") {
    data.confirmado_por = actor.displayName;
    data.confirmado_en = new Date();
  }
  const row = await desvioRepo.update({
    where: { id },
    data,
  });
  return toDetalle(row);
}

export async function deleteDesvio(id: string): Promise<void> {
  const desvioRepo = (prisma as unknown as { desvio: PrismaDesvioModel }).desvio;
  await desvioRepo.delete({ where: { id } });
}

/**
 * Borra de forma masiva los desvios ya "archivados" (RESUELTO o CANCELADO).
 *
 * Antes de borrar recupera los `pdf_path` para que el caller pueda eliminar
 * los binarios huerfanos del disco (la BD por si sola no se encarga del
 * filesystem). Devuelve el numero de filas borradas y la lista de rutas a
 * limpiar.
 */
export async function deleteArchivedDesvios(): Promise<{
  deleted: number;
  pdfPaths: string[];
}> {
  const desvioRepo = (prisma as unknown as { desvio: PrismaDesvioModel }).desvio;
  const where = { estado: { in: ["RESUELTO", "CANCELADO"] as DesvioEstado[] } };
  const rows = await desvioRepo.findMany({ where });
  const pdfPaths = rows
    .map((r) => r.pdf_path)
    .filter((p): p is string => Boolean(p && p.length > 0));
  const result = await desvioRepo.deleteMany({ where });
  return { deleted: result.count, pdfPaths };
}

// ---------- Helpers privados ------------------------------------------------

function formatDDMMYYYY(d: Date): string {
  // En TZ Atlantic/Canary para que la referencia (MAN) ddmmyyyy hhmm sea
  // consistente con la hora canaria que ve el operador.
  const p = canaryParts(d);
  const dd = String(p.day).padStart(2, "0");
  const mm = String(p.month).padStart(2, "0");
  return `${dd}${mm}${p.year}`;
}

function formatHHMM(d: Date): string {
  const p = canaryParts(d);
  const hh = String(p.hour).padStart(2, "0");
  const mi = String(p.minute).padStart(2, "0");
  return `${hh}${mi}`;
}

function composeTitulo(via: string, fecha: Date): string {
  const meses = [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
  ];
  // Tomamos los componentes en TZ Atlantic/Canary para que el titulo refleje
  // el dia canario aunque el host corra en otra TZ.
  const p = canaryParts(fecha);
  return `DESVIO MANUAL ${via.toUpperCase()} ${p.day} ${meses[p.month - 1]} ${p.year}`;
}

// ---------- Tipos minimos del cliente Prisma -------------------------------

/**
 * Tipos manuales del modelo Prisma `desvio`. Los mantenemos aqui para que el
 * resto del codebase (route handlers, poller...) no dependa del cliente
 * regenerado durante el desarrollo. Las firmas reflejan la API real de
 * `@prisma/client` v6 para nuestro modelo.
 */
type PrismaDesvioModel = {
  count(args?: { where?: Record<string, unknown> }): Promise<number>;
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">>;
    skip?: number;
    take?: number;
  }): Promise<DesvioRecord[]>;
  findUnique(args: { where: { id: string } }): Promise<DesvioRecord | null>;
  findFirst(args: { where: Record<string, unknown> }): Promise<DesvioRecord | null>;
  create(args: { data: Record<string, unknown> }): Promise<DesvioRecord>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<DesvioRecord>;
  delete(args: { where: { id: string } }): Promise<DesvioRecord>;
  deleteMany(args: { where?: Record<string, unknown> }): Promise<{ count: number }>;
  groupBy(args: {
    by: ["estado"];
    _count?: { _all?: boolean };
  }): Promise<Array<{ estado: DesvioEstado; _count: { _all: number } }>>;
};
