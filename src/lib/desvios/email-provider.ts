/**
 * Contrato del proveedor de correo que alimenta el poller de desvios.
 *
 * Cada implementacion concreta (gmail, imap, mock...) traduce su API nativa a
 * este modelo comun para que el resto del modulo no dependa de ningun cliente
 * externo. Los binarios de los adjuntos viajan como `Buffer` ya en memoria;
 * el provider tiene que filtrar previamente para no descargar correos que no
 * vengan del remitente autorizado.
 */

export type EmailAttachment = {
  /** Nombre original del adjunto (incluye extension). */
  filename: string;
  /** MIME completo declarado por el remitente; puede venir vacio. */
  contentType: string;
  data: Buffer;
};

export type EmailMessage = {
  /** Identificador opaco del mensaje en el proveedor (Gmail id / IMAP UID...). */
  id: string;
  /** Direccion completa del remitente (`Jefe <jefe@dominio.org>`). */
  from: string;
  subject: string;
  receivedAt: Date;
  attachments: EmailAttachment[];
};

export interface EmailProvider {
  /** Nombre humano para logging y health-check. */
  readonly name: string;

  /** Comprueba que las credenciales son validas y el provider esta listo. */
  connect(): Promise<void>;

  /**
   * Devuelve los correos NO leidos enviados por `sender` (e-mail completo,
   * case-insensitive). El provider deberia limitar el batch para no agotar
   * memoria (recomendado <= 25 correos por tick).
   */
  fetchUnreadFromSender(sender: string): Promise<EmailMessage[]>;

  /** Marca el correo como leido para no volver a procesarlo. */
  markAsRead(messageId: string): Promise<void>;

  /** Libera recursos. Se llama al destruir el poller (no se llama por tick). */
  close(): Promise<void>;
}

/**
 * Errores conocidos del provider. El poller los captura y decide entre
 * reintentar (transitorio) o desactivarse hasta que el operador intervenga.
 */
export class EmailProviderError extends Error {
  readonly transient: boolean;
  constructor(message: string, options: { transient?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = "EmailProviderError";
    this.transient = options.transient ?? true;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
