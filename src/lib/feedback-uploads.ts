/**
 * Constantes y helpers PURE de adjuntos de feedback.
 *
 * Este módulo es seguro para el navegador: no importa nada de Node
 * (`fs`, `crypto`, etc.). El código de guardado en disco vive en
 * `feedback-uploads-server.ts`, y el bundler de Next no lo arrastra al
 * cliente porque se importa solo desde route handlers.
 */

/** Máximo de archivos por reporte de feedback. */
export const FEEDBACK_UPLOAD_MAX_FILES = 6;

/** Bytes máximos por imagen (5 MB). Suficiente para una captura full HD. */
export const FEEDBACK_UPLOAD_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Tamaño combinado máximo de la subida (25 MB). */
export const FEEDBACK_UPLOAD_MAX_TOTAL_BYTES = 25 * 1024 * 1024;

/** MIME aceptados. Solo imagen (jpg/png/webp/gif). */
export const FEEDBACK_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Atributo `accept` para `<input type="file">`. */
export const FEEDBACK_UPLOAD_ACCEPT = "image/*";

/** ¿El fichero es una imagen aceptada? */
export function isAcceptedFeedbackImage(mime: string, fileName: string): boolean {
  const m = (mime || "").toLowerCase();
  if (FEEDBACK_UPLOAD_MIME.has(m)) return true;
  if (m.startsWith("image/")) return true;
  const ext = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext);
}

/** URL pública servida estáticamente desde `public/`. */
export function feedbackAttachmentPublicUrl(
  feedbackId: string,
  diskFileName: string,
): string {
  return `/uploads/feedback/${feedbackId}/${diskFileName}`;
}
