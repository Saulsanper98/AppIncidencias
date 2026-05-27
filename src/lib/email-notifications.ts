/**
 * Capa fina de envío de email a usuarios concretos de la aplicación.
 *
 * A diferencia de `external-notifications.ts` (que manda a una lista global
 * por env var), aquí los destinatarios se resuelven a partir de IDs de
 * usuario, leyendo el email desde la BD. Esto se usa para avisos dirigidos:
 *   - Asignación de ticket → mail al técnico asignado.
 *   - Comentario nuevo en ticket asignado → mail al asignado.
 *   - Pase de turno (handover) → mail al técnico entrante.
 *
 * Si Resend no está configurado (`RESEND_API_KEY` ausente) el helper es
 * no-op: no romper la app y el usuario verá la notificación in-app.
 *
 * Diseño:
 *  - Fire-and-forget. La operación de negocio jamás espera al email.
 *  - Maneja errores en silencio (sólo logs).
 *  - Construye un link absoluto cuando `NEXT_PUBLIC_APP_URL` está definida.
 */

import { prisma } from "@/lib/prisma";

export type SendUserEmailInput = {
  /** IDs de usuario a notificar. Se ignoran los que no tengan email. */
  userIds: (string | null | undefined)[];
  /** Asunto del email (texto plano). */
  subject: string;
  /** Cuerpo HTML del email. Se incrustará tal cual. */
  html: string;
  /** Texto plano alternativo (opcional). Si falta se construye del HTML. */
  text?: string;
  /** ID de mensaje opcional para idempotencia (no se reenvía si llega dos veces seguidas). */
  dedupeKey?: string;
};

const recentlySentKeys = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30_000;

function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.NOTIFICATION_EMAIL_FROM?.trim());
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function appOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return "";
}

export function ticketAbsoluteUrl(ticketId: string): string {
  const origin = appOrigin();
  return origin ? `${origin}/tickets/${ticketId}` : `/tickets/${ticketId}`;
}

/**
 * Envía un email a uno o varios usuarios identificados por ID.
 *
 * Devuelve la promesa de envío para casos de test, pero el llamador típico
 * lo invoca con `void sendUserEmail(...)` (fire-and-forget).
 */
export async function sendUserEmail(input: SendUserEmailInput): Promise<void> {
  try {
    if (!isResendConfigured()) return;
    const cleanIds = input.userIds.filter((id): id is string => Boolean(id));
    if (cleanIds.length === 0) return;

    if (input.dedupeKey) {
      const now = Date.now();
      // Limpieza floja del cache para no crecer indefinidamente.
      for (const [k, ts] of recentlySentKeys) {
        if (now - ts > DEDUPE_WINDOW_MS) recentlySentKeys.delete(k);
      }
      const last = recentlySentKeys.get(input.dedupeKey);
      if (last && now - last < DEDUPE_WINDOW_MS) return;
      recentlySentKeys.set(input.dedupeKey, now);
    }

    const users = await prisma.user.findMany({
      where: {
        id: { in: cleanIds },
        isActive: true,
      },
      select: { email: true },
    });
    const to = users
      .map((u) => (u.email ?? "").trim())
      .filter((e) => e && e.includes("@"));

    if (to.length === 0) return;

    const from = process.env.NOTIFICATION_EMAIL_FROM?.trim();
    const key = process.env.RESEND_API_KEY?.trim();
    if (!from || !key) return;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        html: input.html,
        text: input.text ?? htmlToText(input.html),
      }),
    });
  } catch (error) {
    // Logueamos sin propagar: el email es best-effort.
    console.warn("[email-notifications] error", error);
  }
}

/**
 * Envía un email a una lista fija de direcciones (no usuarios). Útil para
 * notificaciones operativas dirigidas a buzones del centro de control:
 * `tecnicosistemas@movilidadgc.org` y `jefesala@movilidadgc.org`.
 *
 * Acepta opcionalmente `attachments` con el formato de la API de Resend
 * (`{ filename, content: base64 }`).
 */
export async function sendDirectEmail(input: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
  dedupeKey?: string;
}): Promise<void> {
  try {
    if (!isResendConfigured()) return;
    const to = input.to
      .map((e) => (e ?? "").trim())
      .filter((e) => e && e.includes("@"));
    if (to.length === 0) return;

    if (input.dedupeKey) {
      const now = Date.now();
      for (const [k, ts] of recentlySentKeys) {
        if (now - ts > DEDUPE_WINDOW_MS) recentlySentKeys.delete(k);
      }
      const last = recentlySentKeys.get(input.dedupeKey);
      if (last && now - last < DEDUPE_WINDOW_MS) return;
      recentlySentKeys.set(input.dedupeKey, now);
    }

    const from = process.env.NOTIFICATION_EMAIL_FROM?.trim();
    const key = process.env.RESEND_API_KEY?.trim();
    if (!from || !key) return;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        html: input.html,
        text: input.text ?? htmlToText(input.html),
        attachments: input.attachments,
      }),
    });
  } catch (error) {
    console.warn("[email-notifications:direct] error", error);
  }
}

/**
 * Direcciones de los buzones operativos del centro de control. Se leen
 * desde `OPERATIONS_INBOX_EMAILS` (CSV) y por defecto incluyen las dos
 * direcciones acordadas con el equipo.
 */
export function opsInboxEmails(): string[] {
  const env = process.env.OPERATIONS_INBOX_EMAILS?.trim();
  if (env) {
    return env
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));
  }
  return ["tecnicosistemas@movilidadgc.org", "jefesala@movilidadgc.org"];
}

/**
 * Plantilla HTML mínima compartida por todas las notificaciones de ticket.
 * Mantiene el estilo simple para que pase los filtros antispam más estrictos
 * sin imágenes externas ni CSS exótico.
 */
export function renderTicketEmail(opts: {
  headline: string;
  body: string;
  ticketId: string;
  ticketTitle: string;
  busId: string;
  status?: string;
  priority?: string;
  actor?: string | null;
}): { subject: string; html: string } {
  const link = ticketAbsoluteUrl(opts.ticketId);
  const shortId = opts.ticketId.slice(-8).toUpperCase();
  const subject = `[CCMGC] ${opts.headline} · ${opts.ticketTitle.slice(0, 60)}`;

  const html = `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:#0f172a;color:#fff;padding:20px 24px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">
                CCMGC Ticketing
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 8px 0;font-size:18px;color:#0f172a;">${opts.headline}</h1>
                <p style="margin:0 0 16px 0;color:#475569;font-size:14px;line-height:1.5;">${opts.body}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px 0;">
                  <tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;">Ticket</td><td style="padding:4px 0;color:#0f172a;font-size:13px;font-family:monospace;"><strong>${shortId}</strong></td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;">Título</td><td style="padding:4px 0;color:#0f172a;font-size:13px;">${opts.ticketTitle}</td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;">Bus</td><td style="padding:4px 0;color:#0f172a;font-size:13px;font-family:monospace;">${opts.busId}</td></tr>
                  ${opts.status ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;">Estado</td><td style="padding:4px 0;color:#0f172a;font-size:13px;">${opts.status}</td></tr>` : ""}
                  ${opts.priority ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;">Prioridad</td><td style="padding:4px 0;color:#0f172a;font-size:13px;">${opts.priority}</td></tr>` : ""}
                  ${opts.actor ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;">Por</td><td style="padding:4px 0;color:#0f172a;font-size:13px;">${opts.actor}</td></tr>` : ""}
                </table>
                <a href="${link}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;">Abrir ticket</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:12px;">
                Mensaje automático del sistema de ticketing CCMGC. No respondas a este correo.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}
