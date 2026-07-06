/** Política de subidas de la Base de Conocimiento (seguro en cliente). */

export const KB_UPLOAD_MAX_FILES = 8;
export const KB_UPLOAD_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const KB_UPLOAD_MAX_VIDEO_BYTES = 80 * 1024 * 1024;
export const KB_UPLOAD_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const KB_UPLOAD_MAX_TOTAL_BYTES = 120 * 1024 * 1024;

export const KB_UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,.pdf,.mp4,.webm,.mov";

export type KbMediaKind = "image" | "video" | "file";

const IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const FILE_MIMES = new Set(["application/pdf"]);

export function kbMediaKind(mime: string, fileName: string): KbMediaKind | null {
  const m = mime.toLowerCase();
  if (IMAGE_MIMES.has(m)) return "image";
  if (VIDEO_MIMES.has(m)) return "video";
  if (FILE_MIMES.has(m) || fileName.toLowerCase().endsWith(".pdf")) return "file";
  const ext = fileName.toLowerCase();
  if (/\.(jpe?g|png|webp|gif)$/.test(ext)) return "image";
  if (/\.(mp4|webm|mov)$/.test(ext)) return "video";
  if (ext.endsWith(".pdf")) return "file";
  return null;
}

export function kbMediaMaxBytes(kind: KbMediaKind): number {
  if (kind === "image") return KB_UPLOAD_MAX_IMAGE_BYTES;
  if (kind === "video") return KB_UPLOAD_MAX_VIDEO_BYTES;
  return KB_UPLOAD_MAX_FILE_BYTES;
}

export function isAcceptedKbUpload(mime: string, fileName: string): boolean {
  return kbMediaKind(mime, fileName) !== null;
}

export function kbMediaPublicPath(articleId: string, diskFileName: string): string {
  return `/api/kb/media/${encodeURIComponent(articleId)}/${encodeURIComponent(diskFileName)}`;
}
