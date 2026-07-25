/**
 * Pendientes trazables de un pase de turno (checklist).
 * El texto legado `pendingActions` se mantiene como fallback / resumen.
 */

export type HandoverPendingItemStatus = "abierta" | "hecha" | "cancelada";

export type HandoverPendingItem = {
  id: string;
  text: string;
  status: HandoverPendingItemStatus;
  /** Ticket vinculado (opcional); permite deep-link a la ficha. */
  ticketId?: string | null;
  doneAt?: string | null;
  doneById?: string | null;
  doneByName?: string | null;
};

const MAX_ITEMS = 20;
const MAX_TEXT = 280;

export function sanitizePendingItemText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TEXT);
}

function sanitizeTicketId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 64) return null;
  return id;
}

/** Parsea JSON guardado; ignora entradas inválidas. */
export function parsePendingItemsJson(raw: string | null | undefined): HandoverPendingItem[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: HandoverPendingItem[] = [];
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : null;
      const text = sanitizePendingItemText(row.text);
      const status =
        row.status === "hecha" || row.status === "cancelada" || row.status === "abierta"
          ? row.status
          : "abierta";
      if (!id || !text) continue;
      out.push({
        id,
        text,
        status,
        ticketId: sanitizeTicketId(row.ticketId),
        doneAt: typeof row.doneAt === "string" ? row.doneAt : null,
        doneById: typeof row.doneById === "string" ? row.doneById : null,
        doneByName: typeof row.doneByName === "string" ? row.doneByName : null,
      });
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Normaliza el payload del cliente al crear un pase. */
export function normalizePendingItemsInput(value: unknown): HandoverPendingItem[] {
  if (!Array.isArray(value)) return [];
  const out: HandoverPendingItem[] = [];
  const seen = new Set<string>();
  const seenTickets = new Set<string>();
  for (const entry of value) {
    let text: string | null = null;
    let id: string | null = null;
    let ticketId: string | null = null;
    if (typeof entry === "string") {
      text = sanitizePendingItemText(entry);
    } else if (entry && typeof entry === "object") {
      const row = entry as Record<string, unknown>;
      text = sanitizePendingItemText(row.text);
      if (typeof row.id === "string" && row.id.trim()) id = row.id.trim().slice(0, 64);
      ticketId = sanitizeTicketId(row.ticketId);
    }
    if (!text) continue;
    if (ticketId && seenTickets.has(ticketId)) continue;
    const finalId = id && !seen.has(id) ? id : `pi_${Date.now().toString(36)}_${out.length}`;
    if (seen.has(finalId)) continue;
    seen.add(finalId);
    if (ticketId) seenTickets.add(ticketId);
    out.push({
      id: finalId,
      text,
      status: "abierta",
      ticketId,
      doneAt: null,
      doneById: null,
      doneByName: null,
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export function serializePendingItems(items: HandoverPendingItem[]): string | null {
  if (items.length === 0) return null;
  return JSON.stringify(items);
}

/** Texto legado a partir de los ítems (compat / export). */
export function pendingItemsToLegacyText(items: HandoverPendingItem[]): string | null {
  const lines = items.map((i) => i.text.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return lines.join("\n").slice(0, 4000);
}

export function countOpenPendingItems(items: HandoverPendingItem[]): number {
  return items.filter((i) => i.status === "abierta").length;
}

export function markPendingItem(
  items: HandoverPendingItem[],
  itemId: string,
  next: HandoverPendingItemStatus,
  actor: { userId: string; displayName: string },
): HandoverPendingItem[] | null {
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx < 0) return null;
  const current = items[idx];
  if (current.status === next) return items;
  const copy = items.slice();
  if (next === "hecha" || next === "cancelada") {
    copy[idx] = {
      ...current,
      status: next,
      doneAt: new Date().toISOString(),
      doneById: actor.userId,
      doneByName: actor.displayName,
    };
  } else {
    copy[idx] = {
      ...current,
      status: "abierta",
      doneAt: null,
      doneById: null,
      doneByName: null,
    };
  }
  return copy;
}

/** Texto de checklist a partir de un ticket urgente. */
export function pendingTextFromTicket(ticket: {
  id: string;
  title: string;
  busId?: string | null;
  priority?: string | null;
}): string {
  const short = ticket.id.slice(-6).toUpperCase();
  const bus = ticket.busId ? ` · ${ticket.busId}` : "";
  const pri = ticket.priority === "alta" ? " [ALTA]" : "";
  return sanitizePendingItemText(`Seguir ${short}${bus}${pri}: ${ticket.title}`) ?? `Seguir ${short}`;
}
