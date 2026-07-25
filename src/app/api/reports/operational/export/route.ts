/**
 * Exporta el reporte operativo a XLSX (mismas series que la página `/reportes`).
 *
 * Hace una llamada interna al endpoint JSON para reutilizar la lógica de
 * cálculo y luego serializa el resultado a múltiples hojas.
 */

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { resolveRequestActor } from "@/lib/auth-context";
import { canViewOperationalReports } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportPayload = {
  days: number;
  preset?: string;
  label?: string;
  since: string;
  until?: string;
  totals: {
    created: number;
    resolved: number;
    uniqueTicketsResolved?: number;
    slaCompliancePercent: number | null;
    mttrMs: number | null;
  };
  metricsMeta?: {
    definitions: Record<string, string>;
    dataQuality: {
      resolutionEvents: number;
      uniqueTicketsResolved: number;
      technicianAttributed: number;
      legacyUpdatedAtCount: number;
      gapLegacyVsEvents: number;
      ticketsWithoutHistory: number;
    };
  };
  series: { day: string; creados: number; resueltos: number }[];
  byPriority: { priority: string; count: number }[];
  byOperator: { operator: string; count: number }[];
  mttrByOperator: { operator: string; mttrMs: number | null; resolved: number }[];
  byTipo: { tipo: string; count: number }[];
  topBuses: { busId: string; count: number; operator: string | null; municipio: string | null }[];
  topTechnicians: { userId: string; name: string; role: string; resolved: number }[];
};

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem.toString().padStart(2, "0")}m`;
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }
    if (!canViewOperationalReports(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para exportar reportes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // Llamamos al endpoint JSON internamente para no duplicar la lógica de
    // resolución de rango (today/yesterday/lastN/custom). Re-enviamos TODOS
    // los parámetros de query relevantes.
    const url = new URL(request.url);
    url.pathname = "/api/reports/operational";
    const forwarded = new URLSearchParams();
    for (const key of ["range", "from", "to", "days"]) {
      const v = searchParams.get(key);
      if (v != null && v !== "") forwarded.set(key, v);
    }
    url.search = forwarded.toString() ? `?${forwarded.toString()}` : "";
    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const dataRes = await fetch(url.toString(), { headers, cache: "no-store" });
    if (!dataRes.ok) {
      return NextResponse.json(
        { message: "No se pudo obtener el reporte interno" },
        { status: 500 },
      );
    }
    const data = (await dataRes.json()) as ReportPayload;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CCMGC Ticketing";
    workbook.created = new Date();

    // Hoja 1: Resumen.
    const resumen = workbook.addWorksheet("Resumen");
    resumen.columns = [
      { header: "Campo", key: "k", width: 28 },
      { header: "Valor", key: "v", width: 24 },
    ];
    resumen.getRow(1).font = { bold: true };
    resumen.addRows([
      { k: "Periodo", v: data.label ?? `${data.days} días` },
      { k: "Desde", v: data.since },
      { k: "Hasta", v: data.until ?? "—" },
      { k: "Días", v: data.days },
      { k: "Tickets creados", v: data.totals.created },
      { k: "Tickets resueltos (acciones)", v: data.totals.resolved },
      { k: "Tickets únicos cerrados", v: data.totals.uniqueTicketsResolved ?? "—" },
      { k: "SLA cumplido (%)", v: data.totals.slaCompliancePercent ?? "—" },
      { k: "MTTR medio", v: formatMs(data.totals.mttrMs) },
    ]);

    if (data.metricsMeta) {
      const dq = data.metricsMeta.dataQuality;
      resumen.addRows([
        { k: "— Calidad de datos —", v: "" },
        { k: "Cierres registrados", v: dq.resolutionEvents },
        { k: "Atribuidos a técnico", v: dq.technicianAttributed },
        { k: "Método antiguo (updatedAt)", v: dq.legacyUpdatedAtCount },
        { k: "Diferencia legacy vs real", v: dq.gapLegacyVsEvents },
        { k: "Sin historial estructurado", v: dq.ticketsWithoutHistory },
      ]);

      const glosario = workbook.addWorksheet("Glosario métricas");
      glosario.columns = [
        { header: "Métrica", key: "metric", width: 28 },
        { header: "Definición", key: "definition", width: 72 },
      ];
      glosario.getRow(1).font = { bold: true };
      glosario.addRows(
        Object.entries(data.metricsMeta.definitions).map(([metric, definition]) => ({
          metric,
          definition,
        })),
      );
    }

    // Hoja 2: Serie temporal.
    const serie = workbook.addWorksheet("Serie temporal");
    serie.columns = [
      { header: "Día", key: "day", width: 14 },
      { header: "Creados", key: "creados", width: 12 },
      { header: "Resueltos", key: "resueltos", width: 12 },
    ];
    serie.getRow(1).font = { bold: true };
    serie.addRows(data.series);

    // Hoja 3: Por operadora.
    const op = workbook.addWorksheet("Por operadora");
    op.columns = [
      { header: "Operadora", key: "operator", width: 20 },
      { header: "Tickets creados", key: "count", width: 18 },
      { header: "Tickets resueltos", key: "resolved", width: 18 },
      { header: "MTTR", key: "mttr", width: 14 },
    ];
    op.getRow(1).font = { bold: true };
    const mttrByOp = new Map(data.mttrByOperator.map((m) => [m.operator, m]));
    op.addRows(
      data.byOperator.map((b) => ({
        operator: b.operator,
        count: b.count,
        resolved: mttrByOp.get(b.operator)?.resolved ?? 0,
        mttr: formatMs(mttrByOp.get(b.operator)?.mttrMs ?? null),
      })),
    );

    // Hoja 4: Por prioridad.
    const prio = workbook.addWorksheet("Por prioridad");
    prio.columns = [
      { header: "Prioridad", key: "priority", width: 14 },
      { header: "Tickets", key: "count", width: 12 },
    ];
    prio.getRow(1).font = { bold: true };
    prio.addRows(data.byPriority);

    // Hoja 5: Por tipo.
    const tipo = workbook.addWorksheet("Por tipo");
    tipo.columns = [
      { header: "Tipo", key: "tipo", width: 28 },
      { header: "Tickets", key: "count", width: 12 },
    ];
    tipo.getRow(1).font = { bold: true };
    tipo.addRows(data.byTipo);

    // Hoja 6: Top buses.
    const buses = workbook.addWorksheet("Top buses");
    buses.columns = [
      { header: "Bus", key: "busId", width: 12 },
      { header: "Operadora", key: "operator", width: 16 },
      { header: "Municipio", key: "municipio", width: 18 },
      { header: "Tickets", key: "count", width: 12 },
    ];
    buses.getRow(1).font = { bold: true };
    buses.addRows(data.topBuses);

    // Hoja 7: Top técnicos.
    const tec = workbook.addWorksheet("Top técnicos");
    tec.columns = [
      { header: "Técnico", key: "name", width: 28 },
      { header: "Rol", key: "role", width: 22 },
      { header: "Resueltos", key: "resolved", width: 12 },
    ];
    tec.getRow(1).font = { bold: true };
    tec.addRows(data.topTechnicians);

    const buffer = await workbook.xlsx.writeBuffer();
    const fromTag = (data.since ?? "").slice(0, 10).replace(/-/g, "");
    const toTag = (data.until ?? data.since ?? "").slice(0, 10).replace(/-/g, "");
    const periodTag =
      fromTag && toTag && fromTag !== toTag ? `${fromTag}_${toTag}` : `${data.days}d_${toTag}`;
    const filename = `reporte_operativo_${periodTag}.xlsx`;
    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exportando reporte operativo:", error);
    return NextResponse.json(
      { message: "No se pudo exportar el reporte" },
      { status: 500 },
    );
  }
}
