/**
 * Provider Microsoft Graph para Microsoft 365 / Exchange Online.
 *
 * Usa client_credentials (permisos de aplicacion). No requiere usuario
 * interactivo ni contrasenas. Encaja con los tenants modernos donde Microsoft
 * deshabilita Basic Auth IMAP y las contrasenas de aplicacion.
 *
 * Configuracion via .env:
 *   MS_GRAPH_TENANT_ID         (GUID del directorio)
 *   MS_GRAPH_CLIENT_ID         (App registration → cliente)
 *   MS_GRAPH_CLIENT_SECRET     (Certificados y secretos → valor)
 *   MS_GRAPH_MAILBOX           (e-mail del buzon a leer, ej. centrocontrol@movilidadgc.org)
 *
 * Permisos requeridos (concedidos por admin global):
 *   Mail.Read         (Aplicacion)
 *   Mail.ReadWrite    (Aplicacion)
 *
 * Recomendado: restringir el acceso al buzon con `New-ApplicationAccessPolicy`
 * en Exchange Online PowerShell para que este client_id solo pueda leer un
 * buzon concreto.
 *
 * Implementacion sin dependencias externas: solo `fetch` nativo de Node 18+.
 */

import { Buffer } from "node:buffer";

import {
  EmailProviderError,
  type EmailMessage,
  type EmailProvider,
} from "@/lib/desvios/email-provider";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GraphMessage = {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  from?: { emailAddress?: { address?: string; name?: string } };
  sender?: { emailAddress?: { address?: string; name?: string } };
};

type GraphMessagesResponse = {
  value?: GraphMessage[];
  "@odata.nextLink"?: string;
};

type GraphAttachment = {
  "@odata.type"?: string;
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentBytes?: string;
};

type GraphAttachmentsResponse = {
  value?: GraphAttachment[];
  "@odata.nextLink"?: string;
};

type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
};

/**
 * Cliente Microsoft Graph minimalista. Renueva el access_token cuando expira
 * (con un colchon de 60s) y reintenta una vez ante 401 por si Microsoft revoca
 * el token a media tanda.
 */
export class GraphEmailProvider implements EmailProvider {
  readonly name = "graph";
  private accessToken: string | null = null;
  private tokenExpiresAt = 0; // epoch ms

  constructor(private readonly config: GraphConfig) {
    if (
      !config.tenantId ||
      !config.clientId ||
      !config.clientSecret ||
      !config.mailbox
    ) {
      throw new EmailProviderError(
        "Graph: faltan variables MS_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET / MAILBOX.",
        { transient: false },
      );
    }
  }

  async connect(): Promise<void> {
    await this.ensureToken();
    // Smoke check: pedimos un solo mensaje para validar que el client tiene
    // acceso al buzon. Si la policy de aplicacion lo bloquea, fallara aqui
    // con un 403 claro y no perdemos un tick entero del poller.
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      this.config.mailbox,
    )}/messages?$top=1&$select=id`;
    const res = await this.fetchGraph(url);
    if (!res.ok) {
      const body = await safeText(res);
      throw new EmailProviderError(
        `Graph: smoke check fallido (HTTP ${res.status}). ${body}`,
        { transient: res.status >= 500 },
      );
    }
  }

  async fetchUnreadFromSender(sender: string): Promise<EmailMessage[]> {
    const senderLower = sender.toLowerCase();
    // OData filter: solo no leidos del remitente concreto, ordenados por fecha
    // y limitados a 25 por tick. select para no malgastar ancho de banda.
    const filter =
      `isRead eq false and ` +
      `from/emailAddress/address eq '${escapeOData(senderLower)}'`;
    const url =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
        this.config.mailbox,
      )}/messages` +
      `?$filter=${encodeURIComponent(filter)}` +
      `&$top=25` +
      `&$orderby=receivedDateTime asc` +
      `&$select=id,subject,receivedDateTime,hasAttachments,from`;
    const res = await this.fetchGraph(url);
    if (!res.ok) {
      const body = await safeText(res);
      throw new EmailProviderError(
        `Graph: list messages HTTP ${res.status}. ${body}`,
        { transient: res.status >= 500 || res.status === 429 },
      );
    }
    const payload = (await res.json()) as GraphMessagesResponse;
    const items = payload.value ?? [];
    const out: EmailMessage[] = [];
    for (const msg of items) {
      // Filtrado redundante (cinturon y tirantes) en caso de cambios en
      // el filtro OData o aliases con dominios cruzados.
      const fromAddr = (msg.from?.emailAddress?.address ?? "").toLowerCase();
      if (!fromAddr.includes(senderLower)) continue;

      const attachments = msg.hasAttachments
        ? await this.listAttachments(msg.id)
        : [];
      out.push({
        id: msg.id,
        from: msg.from?.emailAddress?.address ?? "",
        subject: msg.subject ?? "",
        receivedAt: msg.receivedDateTime
          ? new Date(msg.receivedDateTime)
          : new Date(),
        attachments,
      });
    }
    return out;
  }

  async markAsRead(messageId: string): Promise<void> {
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      this.config.mailbox,
    )}/messages/${encodeURIComponent(messageId)}`;
    const res = await this.fetchGraph(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
    if (!res.ok) {
      const body = await safeText(res);
      throw new EmailProviderError(
        `Graph: markAsRead HTTP ${res.status}. ${body}`,
        { transient: res.status >= 500 || res.status === 429 },
      );
    }
  }

  async close(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  // -- Internals -------------------------------------------------------------

  private async listAttachments(messageId: string): Promise<EmailMessage["attachments"]> {
    // Solo pedimos adjuntos normales (file), no inline images, hasta 6 max
    // por mensaje (el primer PDF es lo que nos interesa).
    const url =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
        this.config.mailbox,
      )}/messages/${encodeURIComponent(messageId)}/attachments` +
      `?$top=6&$select=id,name,contentType,size,isInline,contentBytes`;
    const res = await this.fetchGraph(url);
    if (!res.ok) {
      // No reventamos toda la tanda por un error puntual en un adjunto.
      console.warn(
        `[graph-provider] no se pudo listar adjuntos de ${messageId}: HTTP ${res.status}`,
      );
      return [];
    }
    const payload = (await res.json()) as GraphAttachmentsResponse;
    const items = payload.value ?? [];
    const out: EmailMessage["attachments"] = [];
    for (const a of items) {
      if (a.isInline) continue;
      if (a["@odata.type"] && !a["@odata.type"].includes("fileAttachment")) {
        // Item/Reference attachments no nos sirven (no traen bytes).
        continue;
      }
      if (!a.contentBytes || !a.name) continue;
      out.push({
        filename: a.name,
        contentType: a.contentType ?? "application/octet-stream",
        data: Buffer.from(a.contentBytes, "base64"),
      });
    }
    return out;
  }

  private async fetchGraph(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    await this.ensureToken();
    const doFetch = (token: string) =>
      fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          authorization: `Bearer ${token}`,
        },
      });

    let res = await doFetch(this.accessToken!);
    if (res.status === 401) {
      // Token revocado / expirado a media tanda: forzamos refresh y reintentamos UNA vez.
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      await this.ensureToken();
      res = await doFetch(this.accessToken!);
    }
    return res;
  }

  private async ensureToken(): Promise<void> {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiresAt - 60_000) return;

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(
      this.config.tenantId,
    )}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    let parsed: TokenResponse;
    try {
      parsed = (await res.json()) as TokenResponse;
    } catch {
      throw new EmailProviderError(
        `Graph: token endpoint devolvio un cuerpo no-JSON (HTTP ${res.status}).`,
        { transient: res.status >= 500 },
      );
    }

    if (!res.ok || !parsed.access_token) {
      const detail =
        parsed.error_description ?? parsed.error ?? `HTTP ${res.status}`;
      // 400/401 con AADSTS suelen ser definitivos (credenciales mal o consent
      // pendiente). 429/5xx los marcamos transitorios.
      const transient = res.status === 429 || res.status >= 500;
      throw new EmailProviderError(`Graph: token fallido. ${detail}`, {
        transient,
      });
    }
    this.accessToken = parsed.access_token;
    const ttl = (parsed.expires_in ?? 3600) * 1000;
    this.tokenExpiresAt = now + ttl;
  }
}

function escapeOData(value: string): string {
  // OData: comillas simples se escapan duplicandolas.
  return value.replace(/'/g, "''");
}

async function safeText(res: Response): Promise<string> {
  try {
    const txt = await res.text();
    return txt.length > 500 ? txt.slice(0, 500) + "..." : txt;
  } catch {
    return "<sin cuerpo>";
  }
}
