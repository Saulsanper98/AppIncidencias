export type ExternalTicketEvent =
  | { kind: "ticket_resolved"; ticketId: string; title: string; busId: string }
  | { kind: "ticket_assigned"; ticketId: string; title: string; busId: string; assigneeName: string | null };

function appOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return "";
}

async function sendResendEmail(subject: string, html: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NOTIFICATION_EMAIL_FROM?.trim();
  const toRaw = process.env.NOTIFICATION_EMAIL_TO?.trim();
  if (!key || !from || !toRaw) return;
  const to = toRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  }).catch(() => {});
}

async function sendTwilioSms(body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const to = process.env.NOTIFICATION_SMS_TO?.trim();
  if (!sid || !token || !from || !to) return;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  }).catch(() => {});
}

/** Dispara email/SMS en segundo plano si hay variables de entorno configuradas. */
export function notifyTicketExternally(event: ExternalTicketEvent): void {
  void (async () => {
    const origin = appOrigin();
    const path = `/tickets/${event.ticketId}`;
    const link = origin ? `${origin}${path}` : path;

    if (event.kind === "ticket_resolved") {
      const subject = `Ticket resuelto: ${event.title.slice(0, 80)}`;
      const html = `<p>Ticket <strong>${event.ticketId}</strong> · bus <strong>${event.busId}</strong> marcado como <strong>resuelto</strong>.</p><p><a href="${link}">Abrir en CCMGC</a></p>`;
      await sendResendEmail(subject, html);
      await sendTwilioSms(`CCMGC: ticket resuelto · ${event.busId} · ${event.title.slice(0, 120)}`);
      return;
    }

    const subject = `Ticket asignado: ${event.title.slice(0, 80)}`;
    const html = `<p>Ticket <strong>${event.ticketId}</strong> · bus <strong>${event.busId}</strong>.</p><p>Asignado a: <strong>${event.assigneeName ?? "—"}</strong></p><p><a href="${link}">Abrir en CCMGC</a></p>`;
    await sendResendEmail(subject, html);
    await sendTwilioSms(`CCMGC: ticket asignado · ${event.busId} · ${event.assigneeName ?? "—"}`);
  })();
}
