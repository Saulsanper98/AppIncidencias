/**
 * Provider "noop" usado cuando no hay configuracion de correo en .env.
 *
 * El poller arranca igualmente pero no consulta ninguna bandeja: ideal para
 * entornos de desarrollo, demos y la primera instalacion del despliegue,
 * antes de que el cliente entregue las credenciales finales.
 */

import type {
  EmailProvider,
  EmailMessage,
} from "@/lib/desvios/email-provider";

export class DisabledEmailProvider implements EmailProvider {
  readonly name = "disabled";

  async connect(): Promise<void> {
    // Nada que hacer.
  }

  async fetchUnreadFromSender(_sender: string): Promise<EmailMessage[]> {
    return [];
  }

  async markAsRead(_messageId: string): Promise<void> {
    // Nada que hacer.
  }

  async close(): Promise<void> {
    // Nada que hacer.
  }
}
