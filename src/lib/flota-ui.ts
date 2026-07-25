/** Utilidades visuales compartidas entre listado y detalle de flota. */

export function formatMunicipio(value: string | null | undefined): string | null {
  const t = value?.trim();
  if (!t) return null;
  const upper = t.toUpperCase().replace(/\s/g, "");
  if (upper === "N.A." || upper === "NA" || upper === "N/A" || t === "—" || t === "-") return null;
  return t;
}

/** Sufijo numérico del bus (p. ej. GF-11018 → 11018). */
export function busNumericSuffix(busId: string): string {
  const trimmed = busId.trim();
  const tail = trimmed.match(/(\d+)\s*$/);
  if (tail) return tail[1];
  const parts = trimmed.split("-");
  const last = parts[parts.length - 1];
  if (last && /^\d+$/.test(last)) return last;
  return trimmed.length <= 6 ? trimmed : trimmed.slice(-5);
}

/** Prefijo del id (p. ej. GF-11018 → GF). */
export function busPrefix(busId: string): string | null {
  const idx = busId.lastIndexOf("-");
  if (idx > 0) return busId.slice(0, idx);
  return null;
}

export function operatorInitials(operator: string): string {
  if (!operator) return "?";
  const words = operator
    .replace(/[.,\-_/]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0] + (words[2]?.[0] ?? "")).toUpperCase().slice(0, 3);
}

export function operatorTone(operator: string): {
  avatar: string;
  header: string;
  chip: string;
} {
  const palette = [
    {
      avatar: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
      header: "from-sky-500/20 to-sky-900/5 border-sky-400/25",
      chip: "border-sky-400/35 bg-sky-500/10 text-sky-200",
    },
    {
      avatar: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
      header: "from-emerald-500/20 to-emerald-900/5 border-emerald-400/25",
      chip: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
    },
    {
      avatar: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
      header: "from-violet-500/20 to-violet-900/5 border-violet-400/25",
      chip: "border-violet-400/35 bg-violet-500/10 text-violet-200",
    },
    {
      avatar: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
      header: "from-amber-500/20 to-amber-900/5 border-amber-400/25",
      chip: "border-amber-400/35 bg-amber-500/10 text-amber-200",
    },
    {
      avatar: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
      header: "from-rose-500/20 to-rose-900/5 border-rose-400/25",
      chip: "border-rose-400/35 bg-rose-500/10 text-rose-200",
    },
    {
      avatar: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30",
      header: "from-cyan-500/20 to-cyan-900/5 border-cyan-400/25",
      chip: "border-cyan-400/35 bg-cyan-500/10 text-cyan-200",
    },
  ];
  let hash = 0;
  for (let i = 0; i < operator.length; i++) hash = (hash * 31 + operator.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function assetTone(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("sae")) return "bg-sky-500/12 text-sky-200 ring-sky-400/25";
  if (t.includes("validator") || t.includes("valid")) return "bg-violet-500/12 text-violet-200 ring-violet-400/25";
  if (t.includes("gps") || t.includes("avl")) return "bg-emerald-500/12 text-emerald-200 ring-emerald-400/25";
  return "bg-[var(--color-surface-2)] text-[var(--color-text-2)] ring-[var(--color-border)]";
}
