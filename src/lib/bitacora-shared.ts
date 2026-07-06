import type { JSONContent } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Clock, Moon, NotebookPen, Sunrise, Sunset } from "lucide-react";

import type { ShiftKey } from "@/lib/shift-utils";
import { SHIFT_LABEL } from "@/lib/shift-utils";

export type BitacoraKind = "nota" | "alerta" | "pendiente";

export type BitacoraEntry = {
  id: string;
  shiftDate: string;
  shift: ShiftKey;
  kind: BitacoraKind;
  title: string | null;
  contentJson: JSONContent;
  pinned: boolean;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
};

export const KIND_META: Record<
  BitacoraKind,
  {
    label: string;
    icon: LucideIcon;
    chip: string;
    chipActive: string;
    stripe: string;
    hero: string;
    glow: string;
    accent: string;
  }
> = {
  nota: {
    label: "Nota",
    icon: NotebookPen,
    chip: "bg-[var(--color-accent)]/12 text-[var(--color-accent)]",
    chipActive: "ring-1 ring-[var(--color-accent)]/20",
    stripe: "from-[var(--color-accent)] to-[var(--color-accent)]/40",
    hero: "from-[var(--color-accent)]/14 via-transparent to-transparent",
    glow: "shadow-[0_24px_60px_-28px_rgba(37,99,235,0.55)]",
    accent: "var(--color-accent)",
  },
  alerta: {
    label: "Alerta",
    icon: AlertTriangle,
    chip: "bg-[var(--color-error)]/12 text-[var(--color-error)]",
    chipActive: "ring-1 ring-[var(--color-error)]/25",
    stripe: "from-[var(--color-error)] to-[var(--color-error)]/35",
    hero: "from-[var(--color-error)]/12 via-transparent to-transparent",
    glow: "shadow-[0_24px_60px_-28px_rgba(239,68,68,0.45)]",
    accent: "var(--color-error)",
  },
  pendiente: {
    label: "Pendiente",
    icon: Clock,
    chip: "bg-[var(--color-warning)]/12 text-[var(--color-warning)]",
    chipActive: "ring-1 ring-[var(--color-warning)]/25",
    stripe: "from-[var(--color-warning)] to-[var(--color-warning)]/35",
    hero: "from-[var(--color-warning)]/10 via-transparent to-transparent",
    glow: "shadow-[0_24px_60px_-28px_rgba(245,158,11,0.4)]",
    accent: "var(--color-warning)",
  },
};

export const SHIFT_ICON = { M: Sunrise, T: Sunset, N: Moon } as const;

export function serializeBitacoraEntry(row: {
  id: string;
  shiftDate: string;
  shift: string;
  kind: string;
  title: string | null;
  contentJson: string;
  pinned: boolean;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BitacoraEntry {
  let content: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };
  try {
    content = JSON.parse(row.contentJson) as JSONContent;
  } catch {
    content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: row.contentJson }] }],
    };
  }
  return {
    id: row.id,
    shiftDate: row.shiftDate,
    shift: row.shift as ShiftKey,
    kind: row.kind as BitacoraKind,
    title: row.title,
    contentJson: content,
    pinned: row.pinned,
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function tipTapPlainText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "mention") {
    const label =
      (typeof node.attrs?.label === "string" && node.attrs.label) ||
      (typeof node.attrs?.id === "string" && node.attrs.id) ||
      "";
    return label ? `@${label}` : "";
  }
  if (!node.content?.length) return "";
  const block = node.type === "paragraph" || node.type === "heading";
  return node.content.map((c) => tipTapPlainText(c)).join(block ? " " : "");
}

export type TipTapInlinePart =
  | { kind: "text"; value: string }
  | { kind: "mention"; label: string }
  | { kind: "entity"; entityKind: "ticket" | "desvio" | "kb" | "bus"; label: string };

const ENTITY_CLASS_KIND: Record<string, "ticket" | "desvio" | "kb" | "bus"> = {
  ticket: "ticket",
  desvio: "desvio",
  kb: "kb",
  bus: "bus",
};

function entityFromTextNode(node: JSONContent): TipTapInlinePart | null {
  const marks = node.marks ?? [];
  const link = marks.find((m) => m.type === "link");
  if (!link?.attrs) return null;
  const kind =
    (typeof link.attrs["data-link-kind"] === "string" && link.attrs["data-link-kind"]) ||
    "";
  const cls = typeof link.attrs.class === "string" ? link.attrs.class : "";
  const fromClass =
    Object.keys(ENTITY_CLASS_KIND).find((k) => cls.includes(`--${k}`)) ?? "";
  const entityKind = ENTITY_CLASS_KIND[kind] ?? ENTITY_CLASS_KIND[fromClass];
  if (!entityKind || !node.text) return null;
  return { kind: "entity", entityKind, label: node.text };
}

export function tipTapInlineParts(node: JSONContent | undefined): TipTapInlinePart[] {
  if (!node) return [];
  if (node.type === "text") {
    const entity = entityFromTextNode(node);
    if (entity) return [entity];
    return node.text ? [{ kind: "text", value: node.text }] : [];
  }
  if (node.type === "mention") {
    const label =
      (typeof node.attrs?.label === "string" && node.attrs.label) ||
      (typeof node.attrs?.id === "string" && node.attrs.id) ||
      "";
    return label ? [{ kind: "mention", label }] : [];
  }
  if (!node.content?.length) return [];
  const inline =
    node.type === "paragraph" ||
    node.type === "heading" ||
    node.type === "listItem" ||
    node.type === "taskItem";
  const parts: TipTapInlinePart[] = [];
  for (const child of node.content) {
    const childParts = tipTapInlineParts(child);
    if (inline && parts.length && childParts.length) {
      const last = parts[parts.length - 1];
      const first = childParts[0];
      const needsSpace =
        (last.kind === "mention" && first.kind === "mention") ||
        (last.kind === "mention" && first.kind === "text" && !first.value.startsWith(" ")) ||
        (last.kind === "text" && !last.value.endsWith(" ") && first.kind === "mention") ||
        (last.kind === "text" &&
          !last.value.endsWith(" ") &&
          first.kind === "text" &&
          !first.value.startsWith(" "));
      if (needsSpace) parts.push({ kind: "text", value: " " });
    }
    parts.push(...childParts);
  }
  return parts;
}

export function truncateInlineParts(parts: TipTapInlinePart[], max: number): TipTapInlinePart[] {
  let len = 0;
  const out: TipTapInlinePart[] = [];
  for (const part of parts) {
    const text =
      part.kind === "mention"
        ? `@${part.label}`
        : part.kind === "entity"
          ? part.label
          : part.value;
    if (len >= max) break;
    if (len + text.length <= max) {
      out.push(part);
      len += text.length;
      continue;
    }
    const room = max - len;
    if (part.kind === "text" && room > 1) {
      out.push({ kind: "text", value: `${part.value.slice(0, room - 1).trimEnd()}…` });
    }
    break;
  }
  return out;
}

export function entryExcerpt(entry: BitacoraEntry, max = 140): string {
  const raw = tipTapPlainText(entry.contentJson).replace(/\s+/g, " ").trim();
  if (!raw) return "Sin contenido";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max).trimEnd()}…`;
}

export function entryDisplayTitle(entry: BitacoraEntry): string {
  if (entry.title?.trim()) return entry.title.trim();
  const ex = entryExcerpt(entry, 72);
  return ex === "Sin contenido" ? "Entrada sin título" : ex;
}

export function initials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function formatBitacoraDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function formatBitacoraTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function shiftBadgeLabel(shift: ShiftKey): string {
  return `${SHIFT_LABEL[shift]} (${shift})`;
}

export function formatShiftDateHuman(ymd: string): string {
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(dt);
  } catch {
    return ymd;
  }
}

export const COMPOSE_KIND_HINTS: Record<BitacoraKind, string> = {
  nota: "Contexto general, observaciones o recordatorios para el siguiente turno.",
  alerta: "Algo urgente que el próximo turno debe atender de inmediato.",
  pendiente: "Tarea abierta que debe quedar resuelta o traspasada al cambio de turno.",
};
