import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

type DayKey = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

const dayLabel: Record<DayKey, string> = {
  Mon: "Lun",
  Tue: "Mar",
  Wed: "Mie",
  Thu: "Jue",
  Fri: "Vie",
  Sat: "Sab",
  Sun: "Dom",
};

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para ver datos de dashboard" }, { status: 401 });
    }

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - 6);

    type RawRow = {
      kind: "status" | "priority" | "operator" | "sla";
      label: string | null;
      day: string | null;
      value: number | null;
      cumplido: number | null;
      incumplido: number | null;
    };

    // Consolidamos agregaciones en una sola consulta para reducir escaneos (cold-start).
    const rows = await prisma.$queryRaw<RawRow[]>`
      WITH filtered AS (
        SELECT status, priority, busId, createdAt, slaDeadline
        FROM "Ticket"
        WHERE createdAt >= ${startDate}
      )
      SELECT
        'status' AS kind,
        status AS label,
        NULL AS day,
        COUNT(*) AS value,
        NULL AS cumplido,
        NULL AS incumplido
      FROM filtered
      GROUP BY status

      UNION ALL

      SELECT
        'priority' AS kind,
        priority AS label,
        NULL AS day,
        COUNT(*) AS value,
        NULL AS cumplido,
        NULL AS incumplido
      FROM filtered
      GROUP BY priority

      UNION ALL

      SELECT
        'operator' AS kind,
        COALESCE(b.operator, 'Sin operadora') AS label,
        NULL AS day,
        COUNT(*) AS value,
        NULL AS cumplido,
        NULL AS incumplido
      FROM filtered f
      LEFT JOIN "Bus" b ON b.id = f.busId
      GROUP BY COALESCE(b.operator, 'Sin operadora')

      UNION ALL

      SELECT
        'sla' AS kind,
        NULL AS label,
        strftime('%Y-%m-%d', createdAt) AS day,
        NULL AS value,
        SUM(CASE WHEN slaDeadline > createdAt THEN 1 ELSE 0 END) AS cumplido,
        SUM(CASE WHEN slaDeadline <= createdAt THEN 1 ELSE 0 END) AS incumplido
      FROM filtered
      GROUP BY day
    `;

    const tickets_by_status = [
      { name: "Abierto", value: 0 },
      { name: "En Proceso", value: 0 },
      { name: "Esperando Repuesto", value: 0 },
      { name: "Resuelto", value: 0 },
    ];

    const tickets_by_priority = [
      { name: "Alta", value: 0 },
      { name: "Media", value: 0 },
      { name: "Baja", value: 0 },
    ];

    const operatorCounts = new Map<string, number>();

    const slaMap = new Map<string, { day: string; cumplido: number; incumplido: number }>();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const day = dayLabel[date.toUTCString().slice(0, 3) as DayKey];
      slaMap.set(date.toISOString().slice(0, 10), { day, cumplido: 0, incumplido: 0 });
    }

    for (const row of rows) {
      if (row.kind === "status" && row.label) {
        if (row.label === "abierto") tickets_by_status[0].value = Number(row.value ?? 0);
        else if (row.label === "en_proceso") tickets_by_status[1].value = Number(row.value ?? 0);
        else if (row.label === "esperando_repuesto") tickets_by_status[2].value = Number(row.value ?? 0);
        else if (row.label === "resuelto") tickets_by_status[3].value = Number(row.value ?? 0);
      } else if (row.kind === "priority" && row.label) {
        if (row.label === "alta") tickets_by_priority[0].value = Number(row.value ?? 0);
        else if (row.label === "media") tickets_by_priority[1].value = Number(row.value ?? 0);
        else if (row.label === "baja") tickets_by_priority[2].value = Number(row.value ?? 0);
      } else if (row.kind === "operator" && row.label) {
        operatorCounts.set(row.label, (operatorCounts.get(row.label) ?? 0) + Number(row.value ?? 0));
      } else if (row.kind === "sla" && row.day) {
        const bucket = slaMap.get(row.day);
        if (!bucket) continue;
        bucket.cumplido = Number(row.cumplido ?? 0);
        bucket.incumplido = Number(row.incumplido ?? 0);
      }
    }

    const tickets_by_operator = Array.from(operatorCounts.entries()).map(([name, value]) => ({ name, value }));
    const sla_compliance = Array.from(slaMap.values());

    return NextResponse.json({
      tickets_by_status,
      tickets_by_operator,
      tickets_by_priority,
      sla_compliance,
    });
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    return NextResponse.json({ message: "No se pudieron cargar los datos del dashboard" }, { status: 500 });
  }
}
