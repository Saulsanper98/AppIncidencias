/**
 * Cola local (offline-first) para borradores de ticket.
 *
 * Cuando el navegador pierde conexión, la creación de un ticket no se
 * puede completar contra `/api/tickets`. En vez de perder los datos,
 * guardamos un "draft" en `localStorage` con un id único; al volver la
 * red intentamos reenviar cada uno.
 *
 * El payload guardado es exactamente el JSON que se enviaría a
 * `POST /api/tickets`. No se incluyen archivos adjuntos (los Blobs no
 * sobreviven a `localStorage`); el usuario tendrá que añadirlos cuando
 * el ticket esté creado.
 *
 * API mínima — el cliente puede:
 *  - `enqueue(payload)`: añade un borrador.
 *  - `list()`: lee los pendientes.
 *  - `remove(id)`: elimina uno (tras enviarlo con éxito).
 *  - `flush(send)`: intenta reenviar todos pasándolos a `send(payload)`.
 *  - `subscribe(listener)`: notifica cambios (útil para UI badge).
 */

const STORAGE_KEY = "ccmgc.offline-ticket-queue.v1";

export type OfflineTicketDraft = {
  id: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

type Listener = () => void;

const listeners = new Set<Listener>();

function readAll(): OfflineTicketDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineTicketDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: OfflineTicketDraft[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota lleno: silenciamos para no romper la app */
  }
  for (const fn of listeners) fn();
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function enqueue(payload: Record<string, unknown>): OfflineTicketDraft {
  const draft: OfflineTicketDraft = {
    id: genId(),
    createdAt: new Date().toISOString(),
    payload,
  };
  const list = readAll();
  list.push(draft);
  writeAll(list);
  return draft;
}

export function list(): OfflineTicketDraft[] {
  return readAll();
}

export function remove(id: string): void {
  const list = readAll().filter((d) => d.id !== id);
  writeAll(list);
}

export function clear(): void {
  writeAll([]);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Intenta reenviar todos los borradores pendientes secuencialmente. Si
 * `send` resuelve, el borrador se elimina; si rechaza (típicamente: aún
 * offline o error de servidor), se mantiene en cola para próximo intento.
 *
 * Retorna `{ sent, remaining }` con los contadores tras el ciclo.
 */
export async function flush(
  send: (payload: Record<string, unknown>) => Promise<void>,
): Promise<{ sent: number; remaining: number }> {
  const drafts = readAll();
  let sent = 0;
  for (const draft of drafts) {
    try {
      await send(draft.payload);
      remove(draft.id);
      sent++;
    } catch {
      // dejamos en cola; intentaremos en el próximo `flush`
    }
  }
  return { sent, remaining: readAll().length };
}
