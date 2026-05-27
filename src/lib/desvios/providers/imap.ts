/**
 * Provider IMAP basado en `imapflow`. Sirve para cualquier proveedor SMTP/IMAP
 * tradicional (Outlook 365 IMAP, dovecot, Gmail con contrasena de aplicacion,
 * etc.). Es el camino mas simple para entornos sin OAuth.
 *
 * Configuracion via .env:
 *   IMAP_HOST              (ej. "imap.gmail.com" o "outlook.office365.com")
 *   IMAP_PORT              (default 993)
 *   IMAP_USER              (cuenta de buzon)
 *   IMAP_PASSWORD          (contrasena de aplicacion o de cuenta)
 *   IMAP_TLS               ("true"/"false", default true)
 *   IMAP_MAILBOX           (default "INBOX")
 *
 * El paquete `imapflow` se importa de forma DINAMICA para no romper el build
 * cuando no esta instalado: si el operador elige el provider IMAP sin haber
 * instalado la dependencia, fallara solo aqui con un mensaje claro.
 */

import {
  EmailProviderError,
  type EmailMessage,
  type EmailProvider,
} from "@/lib/desvios/email-provider";

type ImapFlowClient = {
  connect(): Promise<void>;
  logout(): Promise<void>;
  mailboxOpen(mailbox: string, options?: { readOnly?: boolean }): Promise<void>;
  search(criteria: Record<string, unknown>, options?: { uid?: boolean }): Promise<number[]>;
  fetchOne(uid: string, query: Record<string, unknown>, options?: { uid?: boolean }): Promise<unknown>;
  fetch(
    range: string,
    query: Record<string, unknown>,
    options?: { uid?: boolean },
  ): AsyncIterable<{ uid: number; envelope?: ImapEnvelope; source?: Buffer }>;
  messageFlagsAdd(
    uids: number[] | string,
    flags: string[],
    options?: { uid?: boolean },
  ): Promise<unknown>;
};

type ImapEnvelope = {
  date?: Date;
  subject?: string;
  from?: Array<{ address?: string; name?: string }>;
};

type ParsedMail = {
  messageId?: string;
  from?: { value?: Array<{ address?: string; name?: string }>; text?: string };
  subject?: string;
  date?: Date;
  attachments?: Array<{
    filename?: string;
    contentType?: string;
    content?: Buffer;
  }>;
};

export class ImapEmailProvider implements EmailProvider {
  readonly name = "imap";
  private client: ImapFlowClient | null = null;

  constructor(
    private readonly config: {
      host: string;
      port: number;
      user: string;
      password: string;
      tls: boolean;
      mailbox: string;
    },
  ) {}

  async connect(): Promise<void> {
    if (this.client) return;
    let mod: { ImapFlow?: new (cfg: unknown) => ImapFlowClient };
    try {
      // Importacion oculta al analizador estatico (ver gmail.ts).
      const dynamicImport = new Function(
        "m",
        "return import(m)",
      ) as (m: string) => Promise<unknown>;
      mod = (await dynamicImport("imapflow")) as typeof mod;
    } catch (cause) {
      throw new EmailProviderError(
        "El paquete 'imapflow' no esta instalado. Ejecuta: npm install imapflow mailparser",
        { transient: false, cause },
      );
    }
    if (!mod.ImapFlow) {
      throw new EmailProviderError("imapflow no expone ImapFlow", { transient: false });
    }
    const client = new mod.ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.tls,
      auth: { user: this.config.user, pass: this.config.password },
      logger: false,
    });
    await client.connect();
    await client.mailboxOpen(this.config.mailbox);
    this.client = client;
  }

  async fetchUnreadFromSender(sender: string): Promise<EmailMessage[]> {
    if (!this.client) await this.connect();
    if (!this.client) return [];
    const senderLower = sender.toLowerCase();
    // IMAP SEARCH es case-insensitive sobre headers, pero limita al maximo
    // para que el batch no se desborde.
    const uids = await this.client.search(
      {
        seen: false,
        from: senderLower,
      },
      { uid: true },
    );
    if (uids.length === 0) return [];

    let parseMail: ((source: Buffer) => Promise<ParsedMail>) | null = null;
    try {
      const dynamicImport = new Function(
        "m",
        "return import(m)",
      ) as (m: string) => Promise<unknown>;
      const mailparserMod = (await dynamicImport("mailparser")) as unknown as {
        simpleParser: (source: Buffer) => Promise<ParsedMail>;
      };
      parseMail = mailparserMod.simpleParser;
    } catch (cause) {
      throw new EmailProviderError(
        "El paquete 'mailparser' no esta instalado. Ejecuta: npm install mailparser",
        { transient: false, cause },
      );
    }

    const batch = uids.slice(0, 25);
    const messages: EmailMessage[] = [];

    for await (const item of this.client.fetch(
      batch.join(","),
      { source: true, envelope: true },
      { uid: true },
    )) {
      if (!item.source) continue;
      const parsed: ParsedMail = await parseMail(item.source);
      const fromAddr =
        parsed.from?.value?.[0]?.address?.toLowerCase() ?? parsed.from?.text ?? "";
      if (!fromAddr.includes(senderLower)) continue;
      const attachments = (parsed.attachments ?? [])
        .map((a) => ({
          filename: a.filename ?? "",
          contentType: a.contentType ?? "",
          data: a.content as Buffer,
        }))
        .filter((a): a is { filename: string; contentType: string; data: Buffer } => Buffer.isBuffer(a.data));
      messages.push({
        id: String(item.uid),
        from: fromAddr,
        subject: parsed.subject ?? item.envelope?.subject ?? "",
        receivedAt: parsed.date ?? item.envelope?.date ?? new Date(),
        attachments,
      });
    }

    return messages;
  }

  async markAsRead(messageId: string): Promise<void> {
    if (!this.client) return;
    const uid = Number.parseInt(messageId, 10);
    if (!Number.isFinite(uid)) return;
    await this.client.messageFlagsAdd([uid], ["\\Seen"], { uid: true });
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // ignoramos errores de cierre
      }
      this.client = null;
    }
  }
}
