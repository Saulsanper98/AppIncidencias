/**
 * Provider Gmail basado en `googleapis`.
 *
 * Necesita una OAuth Client (web app) y un refresh_token con scope
 *   `https://www.googleapis.com/auth/gmail.modify`
 * obtenido offline una vez por el operador. Variables de entorno:
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 *   GMAIL_REFRESH_TOKEN
 *   GMAIL_USER       (default "me")
 *
 * El paquete `googleapis` es muy pesado, por eso se carga DINAMICAMENTE: si
 * el operador elige IMAP, el binario nunca entra en memoria.
 */

import {
  EmailProviderError,
  type EmailMessage,
  type EmailProvider,
} from "@/lib/desvios/email-provider";

type GmailListResponse = {
  data: {
    messages?: Array<{ id?: string; threadId?: string }>;
  };
};

type GmailPayload = {
  partId?: string;
  filename?: string;
  mimeType?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPayload[];
};

type GmailMessageResponse = {
  data: {
    id?: string;
    internalDate?: string;
    payload?: GmailPayload;
  };
};

type GmailAttachmentResponse = {
  data: { data?: string };
};

type GmailUsers = {
  messages: {
    list(args: Record<string, unknown>): Promise<GmailListResponse>;
    get(args: Record<string, unknown>): Promise<GmailMessageResponse>;
    modify(args: Record<string, unknown>): Promise<unknown>;
    attachments: {
      get(args: Record<string, unknown>): Promise<GmailAttachmentResponse>;
    };
  };
};

type GmailClient = { users: GmailUsers };

export class GmailEmailProvider implements EmailProvider {
  readonly name = "gmail";
  private gmail: GmailClient | null = null;

  constructor(
    private readonly config: {
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      user: string;
    },
  ) {}

  async connect(): Promise<void> {
    if (this.gmail) return;
    let googleapisMod: unknown;
    try {
      // Importacion oculta al analizador estatico de webpack/Next: el operador
      // solo instala 'googleapis' si elige el provider Gmail; el build NO debe
      // intentar resolverlo en tiempo de compilacion.
      const dynamicImport = new Function(
        "m",
        "return import(m)",
      ) as (m: string) => Promise<unknown>;
      googleapisMod = await dynamicImport("googleapis");
    } catch (cause) {
      throw new EmailProviderError(
        "El paquete 'googleapis' no esta instalado. Ejecuta: npm install googleapis",
        { transient: false, cause },
      );
    }
    const google = (googleapisMod as { google: unknown }).google as {
      auth: {
        OAuth2: new (id: string, secret: string) => { setCredentials(c: { refresh_token: string }): void };
      };
      gmail: (opts: { version: "v1"; auth: unknown }) => GmailClient;
    };
    const oauth2 = new google.auth.OAuth2(this.config.clientId, this.config.clientSecret);
    oauth2.setCredentials({ refresh_token: this.config.refreshToken });
    this.gmail = google.gmail({ version: "v1", auth: oauth2 });
  }

  async fetchUnreadFromSender(sender: string): Promise<EmailMessage[]> {
    if (!this.gmail) await this.connect();
    if (!this.gmail) return [];
    // q = "is:unread from:<sender>" — Gmail soporta esta sintaxis nativa.
    const list = await this.gmail.users.messages.list({
      userId: this.config.user,
      q: `is:unread from:${sender}`,
      maxResults: 25,
    });
    const ids = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    const messages: EmailMessage[] = [];
    for (const id of ids) {
      const detail = await this.gmail.users.messages.get({
        userId: this.config.user,
        id,
        format: "full",
      });
      const payload = detail.data.payload;
      if (!payload) continue;
      const fromHeader = (payload.headers ?? []).find(
        (h) => (h.name ?? "").toLowerCase() === "from",
      )?.value;
      const subjectHeader = (payload.headers ?? []).find(
        (h) => (h.name ?? "").toLowerCase() === "subject",
      )?.value;
      const attachments = await this.collectAttachments(detail.data.id ?? id, payload);
      messages.push({
        id,
        from: (fromHeader ?? "").toLowerCase(),
        subject: subjectHeader ?? "",
        receivedAt: detail.data.internalDate
          ? new Date(Number.parseInt(detail.data.internalDate, 10))
          : new Date(),
        attachments,
      });
    }
    return messages;
  }

  async markAsRead(messageId: string): Promise<void> {
    if (!this.gmail) return;
    await this.gmail.users.messages.modify({
      userId: this.config.user,
      id: messageId,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
  }

  async close(): Promise<void> {
    this.gmail = null;
  }

  private async collectAttachments(
    messageId: string,
    payload: GmailPayload,
  ): Promise<EmailMessage["attachments"]> {
    if (!this.gmail) return [];
    const out: EmailMessage["attachments"] = [];
    const stack: GmailPayload[] = [payload];
    while (stack.length > 0) {
      const part = stack.pop()!;
      if (part.filename && part.body?.attachmentId) {
        const att = await this.gmail.users.messages.attachments.get({
          userId: this.config.user,
          messageId,
          id: part.body.attachmentId,
        });
        const data = att.data.data;
        if (typeof data === "string") {
          out.push({
            filename: part.filename,
            contentType: part.mimeType ?? "application/octet-stream",
            data: Buffer.from(data, "base64url"),
          });
        }
      } else if (part.filename && part.body?.data) {
        out.push({
          filename: part.filename,
          contentType: part.mimeType ?? "application/octet-stream",
          data: Buffer.from(part.body.data, "base64url"),
        });
      }
      if (part.parts) {
        for (const child of part.parts) stack.push(child);
      }
    }
    return out;
  }
}
