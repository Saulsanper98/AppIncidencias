/** Utilidades de medios embebidos en artículos KB (cliente + servidor). */

export type VideoEmbed = { provider: "youtube" | "vimeo"; id: string };

export function parseYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/\/embed\/([^/?]+)/);
      if (m) return m[1];
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function parseVimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("vimeo.com")) return null;
    const m = u.pathname.match(/\/(\d+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function parseVideoEmbed(url: string | undefined | null): VideoEmbed | null {
  if (!url) return null;
  const yt = parseYoutubeId(url);
  if (yt) return { provider: "youtube", id: yt };
  const vm = parseVimeoId(url);
  if (vm) return { provider: "vimeo", id: vm };
  return null;
}

const VIDEO_EXT = /\.(mp4|webm|mov)(\?|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)(\?|$)/i;
const PDF_EXT = /\.pdf(\?|$)/i;

export function isVideoFileUrl(url: string): boolean {
  return VIDEO_EXT.test(url.split("#")[0] ?? url);
}

export function isImageFileUrl(url: string): boolean {
  return IMAGE_EXT.test(url.split("#")[0] ?? url);
}

export function isPdfFileUrl(url: string): boolean {
  return PDF_EXT.test(url.split("#")[0] ?? url);
}

/** Primera imagen del markdown (para miniatura en tarjetas). */
export function extractFirstImageUrl(md: string): string | null {
  const img = md.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (img?.[1] && !isVideoFileUrl(img[1])) return img[1].trim();
  const bare = md.match(/^(https?:\/\/\S+\.(?:jpe?g|png|webp|gif))\s*$/im);
  return bare?.[1]?.trim() ?? null;
}

/** Markdown listo para insertar según tipo de medio subido. */
export function markdownForUploadedMedia(
  kind: "image" | "video" | "file",
  url: string,
  fileName: string,
): string {
  const label = fileName.replace(/[[\]()]/g, "");
  if (kind === "image") return `\n\n![${label}](${url})\n\n`;
  if (kind === "video") return `\n\n![${label}](${url})\n\n`;
  return `\n\n[📎 ${label}](${url})\n\n`;
}

export function markdownForVideoEmbed(url: string): string {
  const embed = parseVideoEmbed(url);
  if (!embed) return `\n\n[Ver vídeo](${url})\n\n`;
  return `\n\n@[video](${url.trim()})\n\n`;
}
