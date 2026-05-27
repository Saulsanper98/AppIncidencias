/**
 * Utilidades para la tabla de contenidos (TOC) de articulos KB.
 *
 * - `slugifyHeading` produce un id estable a partir del texto del heading.
 *   Se usa tanto al renderizar el markdown (para asignar id) como al
 *   construir el TOC en el sidebar, garantizando que coinciden.
 * - `extractHeadings` recorre el markdown linea a linea y devuelve la
 *   estructura de h1/h2/h3 (ignorando los bloques de codigo).
 */

export type KbHeading = {
  id: string;
  depth: 1 | 2 | 3;
  text: string;
};

const ACCENTS: Record<string, string> = {
  "\u00E1": "a", "\u00E0": "a", "\u00E4": "a", "\u00E2": "a", "\u00E3": "a",
  "\u00E9": "e", "\u00E8": "e", "\u00EB": "e", "\u00EA": "e",
  "\u00ED": "i", "\u00EC": "i", "\u00EF": "i", "\u00EE": "i",
  "\u00F3": "o", "\u00F2": "o", "\u00F6": "o", "\u00F4": "o", "\u00F5": "o",
  "\u00FA": "u", "\u00F9": "u", "\u00FC": "u", "\u00FB": "u",
  "\u00F1": "n",
  "\u00E7": "c",
};

export function slugifyHeading(text: string): string {
  const lower = (text ?? "").toString().toLowerCase().trim();
  const noAccents = lower.replace(/[\u00C0-\u017F]/g, (ch) => ACCENTS[ch] ?? ch);
  const ascii = noAccents
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii || "seccion";
}

/**
 * Convierte los hijos de un componente ReactMarkdown a texto plano.
 * Util para generar el id del heading desde el render.
 */
export function reactNodeToText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToText).join("");
  if (typeof node === "object" && node !== null && "props" in node) {
    const children = (node as { props?: { children?: unknown } }).props?.children;
    return reactNodeToText(children);
  }
  return "";
}

export function extractHeadings(markdown: string): KbHeading[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const out: KbHeading[] = [];
  let inCodeBlock = false;
  const seen = new Map<string, number>();

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(raw);
    if (!m) continue;
    const depth = m[1].length as 1 | 2 | 3;
    const text = m[2]
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();
    const base = slugifyHeading(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const id = n === 0 ? base : `${base}-${n}`;
    out.push({ id, depth, text });
  }
  return out;
}
