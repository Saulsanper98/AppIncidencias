/**
 * Persistencia en disco del PDF original de cada Circular Informativa.
 *
 * Carpeta de destino: `public/uploads/desvios/`. Sigue el mismo patron que
 * `src/lib/ticket-uploads.ts` para mantener un unico arbol de uploads.
 *
 * El nombre fisico se construye a partir de la referencia (sanitizada) para
 * que sea trazable visualmente desde el filesystem y para evitar colisiones
 * cuando la circular se reenvia o se reprocesa. Si ya existe un fichero con
 * ese nombre se reutiliza la ruta y no se sobrescribe.
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";

const SUBDIR = "desvios";

/** Devuelve la carpeta absoluta donde van los PDFs. La crea si no existe. */
export async function ensureDesviosDir(): Promise<string> {
  const dir = join(process.cwd(), "public", "uploads", SUBDIR);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Convierte una referencia tipo "(PROD) 23052026 1140" en una porcion de
 * nombre de fichero segura para Windows / Linux (sin parentesis, espacios
 * ni caracteres raros).
 */
export function sanitizeReferenciaForFilename(referencia: string): string {
  const trimmed = (referencia ?? "").trim();
  if (trimmed.length === 0) return `circular_${Date.now()}`;
  return trimmed
    .replace(/[()<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export type SavedPdf = {
  /** Ruta relativa que se guarda en `Desvio.pdf_path` (publica via `/uploads/...`). */
  relativePath: string;
  /** Ruta absoluta en disco (solo para logging / pruebas). */
  absolutePath: string;
};

/**
 * Guarda `buffer` como archivo de circular y devuelve la ruta relativa. Si
 * ya existe un fichero con la misma referencia y extension se reutiliza
 * (idempotencia ante reintentos del poller que entren dos veces al mismo
 * correo).
 *
 * `extension` define el sufijo guardado (default "pdf"). Cuando el operador
 * sube una captura PNG/JPG, se persiste con la extension correspondiente
 * para que la URL publica abra la imagen, no un PDF roto.
 */
export async function saveCircularPdf(
  referencia: string,
  buffer: Buffer | Uint8Array,
  extension: string = "pdf",
): Promise<SavedPdf> {
  const dir = await ensureDesviosDir();
  const ext = sanitizeExtension(extension);
  const baseName = `${sanitizeReferenciaForFilename(referencia)}.${ext}`;
  const absolutePath = join(dir, baseName);
  const relativePath = `uploads/${SUBDIR}/${baseName}`;

  if (await fileExists(absolutePath)) {
    return { absolutePath, relativePath };
  }

  // `Buffer.from` cubre el caso ArrayBufferLike y Uint8Array sin copias adicionales.
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await writeFile(absolutePath, buf);
  return { absolutePath, relativePath };
}

function sanitizeExtension(ext: string): string {
  const cleaned = (ext ?? "")
    .replace(/^\.+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return cleaned.length > 0 && cleaned.length <= 5 ? cleaned : "pdf";
}

/** Construye la URL publica que sirve Next.js para un `pdf_path` dado. */
export function publicUrlForPdfPath(pdfPath: string | null | undefined): string | null {
  if (!pdfPath) return null;
  const cleaned = pdfPath.replace(/^[\/]+/, "");
  return `/${cleaned}`;
}
