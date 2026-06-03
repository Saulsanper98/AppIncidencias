/**
 * GET  /api/desvios → listado paginado con filtros (todos los roles).
 * POST /api/desvios → crear desvio MANUAL (tecnico_campo / gestor).
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import {
  createManualDesvio,
  listDesvios,
  type DesvioListFilters,
} from "@/lib/desvios/repo";
import { canManageDesvios, canReadDesvios } from "@/lib/rbac";
import type { DesvioEstado, DesvioOrigen, DesvioSentido } from "@/lib/desvios/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const estadoSchema = z
  .enum(["PENDIENTE", "ACTIVO", "RESUELTO", "CANCELADO", "TODOS"])
  .optional();
const sentidoSchema = z.enum(["IDA", "VUELTA", "AMBOS", "TODOS"]).optional();
const origenSchema = z.enum(["EMAIL", "MANUAL", "TODOS"]).optional();

const paradaSchema = z.object({
  nombre: z.string().min(1, "Nombre obligatorio").max(120),
  codigo: z.string().min(1, "Codigo obligatorio").max(20),
});

const createSchema = z
  .object({
    via: z.string().min(2, "La via es obligatoria").max(160),
    tramo: z.string().min(2, "El tramo es obligatorio").max(400),
    motivo: z.string().min(2, "El motivo es obligatorio").max(400),
    fecha_inicio: z.coerce.date(),
    fecha_fin: z.coerce.date(),
    hora_fin_estimada: z.boolean().optional().default(false),
    sin_fecha_fin: z.boolean().optional().default(false),
    sentido: z.enum(["IDA", "VUELTA", "AMBOS"]),
    lineas_afectadas: z
      .array(z.string().min(1).max(20))
      .max(40, "Demasiadas lineas")
      .default([]),
    paradas_fuera: z.array(paradaSchema).max(60).optional().default([]),
    paradas_alternativas: z.array(paradaSchema).max(60).optional().default([]),
    notas: z.string().max(2000).optional().nullable(),
    url_itinerario: z
      .string()
      .max(500)
      .optional()
      .nullable()
      .refine((v) => !v || /^https?:\/\//i.test(v.trim()), {
        message: "La URL del itinerario debe empezar por http o https",
      }),
  })
  .refine(
    (d) => d.sin_fecha_fin || d.fecha_fin.getTime() > d.fecha_inicio.getTime(),
    {
      message: "La fecha de fin debe ser posterior a la de inicio",
      path: ["fecha_fin"],
    },
  );

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
  }
  if (!canReadDesvios(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const filters: DesvioListFilters = {
      estado: (url.searchParams.get("estado") as DesvioEstado | "TODOS") || undefined,
      sentido: (url.searchParams.get("sentido") as DesvioSentido | "TODOS") || undefined,
      origen: (url.searchParams.get("origen") as DesvioOrigen | "TODOS") || undefined,
      linea: url.searchParams.get("linea") ?? undefined,
      search: url.searchParams.get("q") ?? undefined,
      page: Number.parseInt(url.searchParams.get("page") ?? "1", 10),
      pageSize: Number.parseInt(url.searchParams.get("pageSize") ?? "30", 10),
    };
    const desdeParam = url.searchParams.get("desde");
    const hastaParam = url.searchParams.get("hasta");
    if (desdeParam) filters.desde = new Date(desdeParam);
    if (hastaParam) filters.hasta = new Date(hastaParam);

    // Validamos enums de query (descartar valores erroneos sin reventar).
    estadoSchema.parse(filters.estado);
    sentidoSchema.parse(filters.sentido);
    origenSchema.parse(filters.origen);

    const result = await listDesvios(filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("desvios list:", error);
    return NextResponse.json({ message: "No se pudieron cargar los desvios" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
  }
  if (!canManageDesvios(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Datos invalidos", errors: parsed.error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    const data = parsed.data;
    const desvio = await createManualDesvio({
      via: data.via.trim(),
      tramo: data.tramo.trim(),
      motivo: data.motivo.trim(),
      fecha_inicio: data.fecha_inicio,
      fecha_fin: data.fecha_fin,
      hora_fin_estimada: data.hora_fin_estimada,
      sin_fecha_fin: data.sin_fecha_fin,
      sentido: data.sentido,
      lineas_afectadas: data.lineas_afectadas.map((l) => l.trim()).filter(Boolean),
      paradas_fuera: data.paradas_fuera,
      paradas_alternativas: data.paradas_alternativas,
      notas: data.notas ?? null,
      url_itinerario: data.url_itinerario ?? null,
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "desvio.created_manual",
      detail: `${desvio.referencia} ${desvio.via}`.slice(0, 240),
    });

    return NextResponse.json({ desvio }, { status: 201 });
  } catch (error) {
    console.error("desvios create:", error);
    return NextResponse.json({ message: "No se pudo crear el desvio" }, { status: 500 });
  }
}
