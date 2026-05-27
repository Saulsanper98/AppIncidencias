/**
 * Singleton de monitorizacion de correo para el modulo Desvios.
 *
 * Diseno:
 *   - Una sola instancia por proceso Node. En el despliegue NSSM esto basta.
 *   - `setInterval` con jitter pequeno para evitar que coincida exactamente
 *     con otros pollers internos del sistema.
 *   - Cada tick:
 *       1. `provider.fetchUnreadFromSender(EMAIL_AUTHORIZED_SENDER)`.
 *       2. Por cada correo: extraer 1er PDF, parsear, persistir.
 *       3. Si el parseo o el guardado fallan, NO marcamos como leido para
 *          que el siguiente tick reintente.
 *       4. Tras crear los registros, emitimos eventos SSE `desvio_nuevo`.
 *
 * El singleton se inicia perezosamente la primera vez que se invoca
 * `getDesviosPoller()`. Tambien se puede arrancar a mano via
 * `POST /api/desvios/poller/start` (cubierto en otro archivo).
 */

import { sseBus } from "@/lib/sse-bus";
import { createDesvioFromParsed, findDesvioByEmailId } from "@/lib/desvios/repo";
import {
  EmailProviderError,
  type EmailMessage,
  type EmailProvider,
} from "@/lib/desvios/email-provider";
import { DisabledEmailProvider } from "@/lib/desvios/providers/disabled";
import { parsearCircularPDFTodosLosDias } from "@/lib/desvios/parser";
import { saveCircularPdf } from "@/lib/desvios/pdf-storage";
import { extractPdfText } from "@/lib/desvios/pdf-text";
import { calcularUrgencia } from "@/lib/desvios/urgencia";

/** Estado expuesto via /api/desvios/poller/start y para diagnostico. */
export type PollerStatus = {
  enabled: boolean;
  provider: string;
  sender: string;
  intervalSeconds: number;
  running: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  totalChecks: number;
  totalCreated: number;
};

type PollerConfig = {
  enabled: boolean;
  intervalSeconds: number;
  sender: string;
};

class DesviosPoller {
  private provider: EmailProvider = new DisabledEmailProvider();
  private config: PollerConfig = readPollerConfig();
  private timerId: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private lastRunAt: Date | null = null;
  private lastError: string | null = null;
  private totalChecks = 0;
  private totalCreated = 0;

  status(): PollerStatus {
    return {
      enabled: this.config.enabled,
      provider: this.provider.name,
      sender: this.config.sender,
      intervalSeconds: this.config.intervalSeconds,
      running: this.timerId !== null,
      lastRunAt: this.lastRunAt ? this.lastRunAt.toISOString() : null,
      lastError: this.lastError,
      totalChecks: this.totalChecks,
      totalCreated: this.totalCreated,
    };
  }

  /**
   * Re-lee variables de entorno y arranca el poller si esta habilitado.
   * Si ya estaba en marcha lo reinicia con la nueva configuracion.
   */
  async start(): Promise<PollerStatus> {
    this.stop();
    this.config = readPollerConfig();
    this.provider = await createProviderFromEnv();
    if (!this.config.enabled || this.provider.name === "disabled") {
      this.lastError = null;
      return this.status();
    }

    try {
      await this.provider.connect();
    } catch (err) {
      this.lastError = formatError(err);
      console.warn("[desvios-poller] no se pudo conectar al provider:", this.lastError);
      // Mantenemos enabled=true para que el operador pueda corregir las
      // credenciales y reintentar con POST /api/desvios/poller/start.
      return this.status();
    }

    // Primer tick inmediato y luego cada `intervalSeconds`.
    void this.runTick();
    this.timerId = setInterval(() => {
      void this.runTick();
    }, this.config.intervalSeconds * 1000);
    return this.status();
  }

  stop(): PollerStatus {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    // Cerramos en background, sin bloquear la respuesta.
    void this.provider.close().catch(() => {});
    return this.status();
  }

  private async runTick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    this.totalChecks++;
    this.lastRunAt = new Date();
    try {
      const messages = await this.provider.fetchUnreadFromSender(this.config.sender);
      for (const msg of messages) {
        try {
          const created = await this.processMessage(msg);
          if (created > 0) this.totalCreated += created;
        } catch (innerErr) {
          this.lastError = formatError(innerErr);
          console.error(
            `[desvios-poller] error procesando correo ${msg.id}:`,
            innerErr,
          );
          // NO marcamos como leido: en el siguiente tick reintentamos.
        }
      }
      this.lastError = null;
    } catch (err) {
      this.lastError = formatError(err);
      console.warn("[desvios-poller] fetch fallo:", this.lastError);
      // Si es un error definitivo (no transitorio) paramos para que el
      // operador investigue en vez de loguear en bucle.
      if (err instanceof EmailProviderError && !err.transient) {
        this.stop();
      }
    } finally {
      this.inFlight = false;
    }
  }

  private async processMessage(msg: EmailMessage): Promise<number> {
    const senderLower = (this.config.sender ?? "").toLowerCase();
    if (senderLower.length > 0 && !msg.from.toLowerCase().includes(senderLower)) {
      console.warn(
        `[desvios-poller] descartado correo ${msg.id} de remitente no autorizado: ${msg.from}`,
      );
      return 0;
    }

    // Idempotencia: si ya creamos algun desvio para este correo, salta.
    const existing = await findDesvioByEmailId(msg.id);
    if (existing) {
      // Marcamos leido por si quedo pendiente y devolvemos 0.
      await this.provider.markAsRead(msg.id).catch(() => {});
      return 0;
    }

    const pdf = msg.attachments.find(
      (a) => /pdf/i.test(a.contentType) || /\.pdf$/i.test(a.filename),
    );
    if (!pdf) {
      console.warn(`[desvios-poller] correo ${msg.id} sin adjunto PDF. Ignorado.`);
      return 0;
    }

    const text = await extractPdfText(pdf.data);
    const parseds = parsearCircularPDFTodosLosDias(text);
    if (parseds.length === 0) {
      throw new Error("Parser devolvio 0 dias.");
    }

    const { relativePath } = await saveCircularPdf(parseds[0].referencia, pdf.data);

    const created: { id: string; via: string; lineas: string[]; fecha_inicio: string }[] = [];
    for (const parsed of parseds) {
      const desvio = await createDesvioFromParsed(parsed, {
        emailOrigenId: msg.id,
        pdfPath: relativePath,
      });
      created.push({
        id: desvio.id,
        via: desvio.via,
        lineas: desvio.lineas_afectadas,
        fecha_inicio: desvio.fecha_inicio,
      });
    }

    await this.provider.markAsRead(msg.id);

    for (const c of created) {
      sseBus.publish("desvio_nuevo", {
        id: c.id,
        via: c.via,
        lineas: c.lineas,
        fecha_inicio: c.fecha_inicio,
        urgencia: calcularUrgencia({
          lineas_afectadas: c.lineas,
          fecha_inicio: c.fecha_inicio,
          fecha_fin: c.fecha_inicio,
        }),
      });
    }

    console.log(
      `[desvios-poller] correo ${msg.id} procesado: creados ${created.length} desvio(s).`,
    );
    return created.length;
  }
}

const globalForPoller = globalThis as unknown as { __ccmgcDesviosPoller?: DesviosPoller };

export function getDesviosPoller(): DesviosPoller {
  if (!globalForPoller.__ccmgcDesviosPoller) {
    globalForPoller.__ccmgcDesviosPoller = new DesviosPoller();
  }
  return globalForPoller.__ccmgcDesviosPoller;
}

// ---------- Helpers ---------------------------------------------------------

function readPollerConfig(): PollerConfig {
  const intervalRaw = process.env.EMAIL_POLL_INTERVAL ?? "300";
  const parsed = Number.parseInt(intervalRaw, 10);
  const intervalSeconds = Number.isFinite(parsed) && parsed >= 30 ? parsed : 300;
  return {
    enabled: (process.env.EMAIL_PROVIDER ?? "").length > 0,
    intervalSeconds,
    sender: process.env.EMAIL_AUTHORIZED_SENDER ?? "jefesala@movilidadgc.org",
  };
}

async function createProviderFromEnv(): Promise<EmailProvider> {
  const which = (process.env.EMAIL_PROVIDER ?? "").toLowerCase();
  if (which === "graph" || which === "m365" || which === "microsoft365") {
    const { GraphEmailProvider } = await import("@/lib/desvios/providers/graph");
    return new GraphEmailProvider({
      tenantId: process.env.MS_GRAPH_TENANT_ID ?? "",
      clientId: process.env.MS_GRAPH_CLIENT_ID ?? "",
      clientSecret: process.env.MS_GRAPH_CLIENT_SECRET ?? "",
      mailbox: process.env.MS_GRAPH_MAILBOX ?? "",
    });
  }
  if (which === "gmail") {
    const { GmailEmailProvider } = await import("@/lib/desvios/providers/gmail");
    return new GmailEmailProvider({
      clientId: process.env.GMAIL_CLIENT_ID ?? "",
      clientSecret: process.env.GMAIL_CLIENT_SECRET ?? "",
      refreshToken: process.env.GMAIL_REFRESH_TOKEN ?? "",
      user: process.env.GMAIL_USER ?? "me",
    });
  }
  if (which === "imap" || which === "outlook") {
    const { ImapEmailProvider } = await import("@/lib/desvios/providers/imap");
    return new ImapEmailProvider({
      host: process.env.IMAP_HOST ?? "",
      port: Number.parseInt(process.env.IMAP_PORT ?? "993", 10),
      user: process.env.IMAP_USER ?? "",
      password: process.env.IMAP_PASSWORD ?? "",
      tls: (process.env.IMAP_TLS ?? "true").toLowerCase() !== "false",
      mailbox: process.env.IMAP_MAILBOX ?? "INBOX",
    });
  }
  return new DisabledEmailProvider();
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
