import { addDays } from "date-fns";

import type { FormState } from "@/components/tickets/tickets-module-types";
import { writeAuditEvent } from "@/lib/audit";
import { getSlaMinutesForPriority } from "@/lib/sla-config";
import { tryAutoAssignTicket } from "@/lib/ticket-auto-assign";
import { recordTicketStatusChange } from "@/lib/ticket-status-history";
import { calculatePriority } from "@/lib/ticketing";
import { prisma } from "@/lib/prisma";

type RecurrenceTemplate = Pick<
  FormState,
  "title" | "description" | "tipo" | "subtipo" | "subsubtipo" | "dominio" | "nivelImpacto" | "origenTecnico" | "observaciones"
> & { busId?: string };

export async function runDueTicketRecurrences(): Promise<number> {
  const now = new Date();
  const due = await prisma.ticketRecurrence.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    take: 20,
  });

  let created = 0;
  for (const rec of due) {
    try {
      const tpl = JSON.parse(rec.templateJson) as RecurrenceTemplate;
      const busId = (tpl.busId ?? rec.busId ?? "").trim();
      if (!busId || !tpl.title?.trim() || !tpl.description?.trim()) {
        await prisma.ticketRecurrence.update({
          where: { id: rec.id },
          data: { active: false },
        });
        continue;
      }

      const bus = await prisma.bus.findUnique({
        where: { id: busId },
        include: { assets: true },
      });
      if (!bus || bus.assets.length === 0) {
        await prisma.ticketRecurrence.update({
          where: { id: rec.id },
          data: { nextRunAt: addDays(now, rec.intervalDays) },
        });
        continue;
      }

      const asset = bus.assets.find((a) => a.type === "sae") ?? bus.assets[0];
      const priority = calculatePriority({
        assetType: asset.type,
        impactedLines: 1,
        serviceStopped: false,
        nivelImpacto: (tpl.nivelImpacto as "Alto" | "Medio" | "Bajo") || "Medio",
      });
      const slaMinutes = await getSlaMinutesForPriority(priority);
      const slaDeadline = new Date(now.getTime() + slaMinutes * 60_000);

      const ticket = await prisma.ticket.create({
        data: {
          busId,
          assetId: asset.id,
          title: tpl.title.trim(),
          description: tpl.description.trim(),
          tipo: tpl.tipo ?? null,
          subtipo: tpl.subtipo ?? null,
          subsubtipo: tpl.subsubtipo ?? null,
          dominio: tpl.dominio ?? null,
          nivelImpacto: tpl.nivelImpacto ?? null,
          origenTecnico: tpl.origenTecnico ?? null,
          observaciones: tpl.observaciones ?? null,
          status: "abierto",
          priority,
          slaDeadline,
          createdByUserId: rec.createdByUserId,
        },
      });

      await recordTicketStatusChange({
        ticketId: ticket.id,
        fromStatus: null,
        toStatus: "abierto",
        changedByUserId: rec.createdByUserId,
        changedByName: "Sistema (recurrencia)",
        comment: `Ticket recurrente: ${rec.name}`,
      });

      await writeAuditEvent({
        userId: rec.createdByUserId,
        ticketId: ticket.id,
        action: "ticket.created",
        detail: `Recurrencia "${rec.name}" (${rec.intervalDays}d).`,
      });

      await tryAutoAssignTicket(ticket.id);

      await prisma.ticketRecurrence.update({
        where: { id: rec.id },
        data: {
          lastRunAt: now,
          nextRunAt: addDays(now, rec.intervalDays),
        },
      });
      created += 1;
    } catch (error) {
      console.warn("[ticket-recurrence] fallo en", rec.id, error);
    }
  }
  return created;
}
