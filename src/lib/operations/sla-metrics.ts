/** Utilidades compartidas de SLA entre ticker, dashboard y bandeja. */

export function slaMinutesRemaining(deadline: Date | string): number {
  const ms = typeof deadline === "string" ? new Date(deadline).getTime() : deadline.getTime();
  return Math.round((ms - Date.now()) / 60000);
}

export function isSlaOverdue(deadline: Date | string): boolean {
  return slaMinutesRemaining(deadline) <= 0;
}

/** Trunca título largo manteniendo el identificador del bus visible. */
export function formatTicketTickerLabel(
  busId: string,
  title: string,
  maxTitleLen = 42,
): { label: string; fullLabel: string } {
  const fullLabel = `${busId} · ${title}`;
  const trimmed = title.trim();
  const truncated =
    trimmed.length > maxTitleLen ? `${trimmed.slice(0, maxTitleLen).trimEnd()}…` : trimmed;
  return { label: `${busId} · ${truncated}`, fullLabel };
}
