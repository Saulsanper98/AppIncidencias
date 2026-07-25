/** Mediana de un array numérico (0 si está vacío). */
export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

/** Orden canónico de prioridad para mostrarlas siempre igual. */
export function ticketPrioritySortOrder(p: string): number {
  switch (p) {
    case "critica":
      return 0;
    case "alta":
      return 1;
    case "media":
      return 2;
    case "baja":
      return 3;
    default:
      return 4;
  }
}
