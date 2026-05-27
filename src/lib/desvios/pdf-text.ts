/**
 * Extraccion de texto plano desde un PDF.
 *
 * Usamos dos extractores con fallback transparente:
 *
 *   1. **pdfjs-dist** (Mozilla, la libreria oficial detras de Firefox). Es la
 *      mas robusta con PDFs generados por InDesign / Affinity / herramientas
 *      corporativas que no respetan al 100% el spec del PDF.
 *   2. **pdf-parse** como fallback. Es mas ligera pero falla con PDFs cuyos
 *      mapas ToUnicode no son estandar.
 *
 * Ambos modulos se cargan con `new Function("m", "return import(m)")` para
 * evitar el analisis estatico de Next/webpack: as? no necesitamos tipos
 * declarados y los modulos opcionales no rompen el build aunque falten.
 */

import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export class PdfTextError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message);
    this.name = "PdfTextError";
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

type PdfjsTextItem = { str?: string };
type PdfjsTextContent = { items?: PdfjsTextItem[] };
type PdfjsPage = { getTextContent(): Promise<PdfjsTextContent> };
type PdfjsDocument = {
  numPages: number;
  getPage(n: number): Promise<PdfjsPage>;
};
type PdfjsLoadingTask = { promise: Promise<PdfjsDocument> };
type PdfjsModule = {
  getDocument(args: {
    data: Uint8Array;
    useSystemFonts?: boolean;
    isEvalSupported?: boolean;
    useWorkerFetch?: boolean;
    disableFontFace?: boolean;
  }): PdfjsLoadingTask;
  GlobalWorkerOptions?: { workerSrc?: string };
};

type PdfParseFn = (data: Buffer) => Promise<{ text: string }>;
type PdfParseModule = PdfParseFn | { default?: PdfParseFn };

const dynamicImport = new Function(
  "m",
  "return import(m)",
) as (m: string) => Promise<unknown>;

/**
 * Devuelve el texto plano extraido del PDF. Combina extractores; si ninguno
 * produce contenido razonable, lanza PdfTextError con el detalle de ambos.
 *
 * Umbral "razonable" = 20 caracteres no-blancos. Por debajo asumimos que el
 * PDF es una imagen escaneada sin OCR.
 */
export async function extractPdfText(
  buffer: Buffer | Uint8Array,
): Promise<string> {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const errores: string[] = [];

  // 1) pdfjs-dist (preferido).
  try {
    const text = await extractWithPdfjs(buf);
    if (text.replace(/\s+/g, "").length >= 20) return text;
    errores.push(
      `pdfjs-dist devolvio texto muy corto (${text.replace(/\s+/g, "").length} chars).`,
    );
  } catch (err) {
    errores.push(
      `pdfjs-dist fallo: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2) pdf-parse (fallback).
  try {
    const text = await extractWithPdfParse(buf);
    if (text.replace(/\s+/g, "").length >= 20) return text;
    errores.push(
      `pdf-parse devolvio texto muy corto (${text.replace(/\s+/g, "").length} chars).`,
    );
  } catch (err) {
    errores.push(
      `pdf-parse fallo: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3) OCR (Tesseract.js) sobre las paginas renderizadas. Es el ultimo
  //    recurso porque es ~10x mas lento (10-20s por pagina) y requiere
  //    descargar el modelo `spa.traineddata` la primera vez. Cubre el caso
  //    de PDFs cuyo contenido es una imagen (texto vectorizado en Illustrator
  //    o capturas pegadas, como las circulares de jefe de sala).
  try {
    const { ocrPdfBuffer } = await import("@/lib/desvios/pdf-ocr");
    const text = await ocrPdfBuffer(buf);
    if (text.replace(/\s+/g, "").length >= 20) return text;
    errores.push(
      `OCR devolvio texto muy corto (${text.replace(/\s+/g, "").length} chars).`,
    );
  } catch (err) {
    // Logueamos el stack completo en el server para diagnostico (no lo
    // exponemos al cliente, eso queda solo en el mensaje resumido).
    if (err instanceof Error) {
      console.error("[pdf-text] OCR fallo", err.message, "\n", err.stack);
    } else {
      console.error("[pdf-text] OCR fallo (no Error):", err);
    }
    errores.push(
      `OCR fallo: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  throw new PdfTextError(
    `No se pudo extraer texto del PDF tras 3 intentos (texto, ToUnicode y OCR). Detalle: ${errores.join(
      " | ",
    )}`,
  );
}

/**
 * Extrae texto de una imagen (PNG/JPG) usando OCR. Pensado para cuando el
 * operador prefiere subir directamente una captura de pantalla en vez del
 * PDF.
 */
export async function extractImageText(
  buffer: Buffer | Uint8Array,
): Promise<string> {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const { ocrImageBuffer } = await import("@/lib/desvios/pdf-ocr");
  const text = await ocrImageBuffer(buf);
  if (text.replace(/\s+/g, "").length < 20) {
    throw new PdfTextError(
      `OCR de la imagen devolvio muy poco texto (${text.length} chars). ` +
        `Verifica que sea legible y prueba una resolucion mayor.`,
    );
  }
  return text;
}

async function extractWithPdfjs(buffer: Buffer): Promise<string> {
  // Importacion dinamica de la build "legacy" que es compatible con Node sin DOM.
  let mod: PdfjsModule;
  try {
    mod = (await dynamicImport("pdfjs-dist/legacy/build/pdf.mjs")) as PdfjsModule;
  } catch (cause) {
    throw new Error(
      `No se pudo cargar pdfjs-dist: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }

  // pdfjs v5 exige siempre `workerSrc` aunque no se vaya a usar worker real.
  // Resolvemos el path absoluto del worker file via `createRequire` (mas
  // robusto que usar process.cwd, sobrevive a cambios de cwd al arrancar el
  // servicio Windows con NSSM).
  if (mod.GlobalWorkerOptions) {
    const workerSrc = resolveWorkerUrl();
    if (workerSrc) mod.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  // pdfjs requiere un Uint8Array nuevo (no comparte memoria con el Buffer).
  const data = new Uint8Array(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );

  const loadingTask = mod.getDocument({
    data,
    useSystemFonts: false,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;

  const out: string[] = [];
  let totalItems = 0;
  let totalNonEmptyItems = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items = content.items ?? [];
    totalItems += items.length;
    const pageText = items
      .map((it) => (typeof it.str === "string" ? it.str : ""))
      .filter((s) => s.length > 0)
      .join(" ");
    totalNonEmptyItems += items.filter(
      (it) => typeof it.str === "string" && it.str.length > 0,
    ).length;
    out.push(pageText);
  }
  const joined = out.join("\n");
  // Log de diagnostico: imprescindible para depurar PDFs que devuelven 0 chars
  // (texto vectorizado, fuentes sin ToUnicode, etc.). Solo se imprime una linea
  // por extraccion, no genera ruido.
  console.log(
    `[pdf-text/pdfjs] pages=${pdf.numPages} items=${totalItems} non_empty=${totalNonEmptyItems} chars=${joined.length} sample="${joined.slice(0, 120).replace(/\s+/g, " ").trim()}"`,
  );
  return joined;
}

/**
 * Resuelve la URL `file://...` absoluta del worker de pdfjs.
 *
 * Probamos en orden:
 *   1. `require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")`
 *      (la forma cannonical: respeta el algoritmo de resolucion de Node).
 *   2. Path relativo al `cwd` del servicio si lo anterior falla (fallback
 *      para edge cases de bundlers que reescriben require).
 *
 * Devuelve null solo si no encuentra nada; el caller registra el detalle.
 */
function resolveWorkerUrl(): string | null {
  // Intento 1: createRequire desde este modulo.
  try {
    // `import.meta.url` no esta disponible en todos los runtimes que Next
    // utiliza al compilar, asi que usamos una URL conocida. `__filename`
    // tampoco esta disponible en ESM. Solucion: createRequire de un path
    // arbitrario dentro del proyecto.
    const req = createRequire(pathToFileURL(process.cwd() + path.sep).href);
    const workerPath = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    return pathToFileURL(workerPath).href;
  } catch {
    /* sigue al siguiente intento */
  }

  // Intento 2: path relativo al cwd (caso NSSM con cwd = root del proyecto).
  try {
    const workerPath = path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs",
    );
    return pathToFileURL(workerPath).href;
  } catch {
    return null;
  }
}

async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  let mod: PdfParseModule;
  try {
    mod = (await dynamicImport("pdf-parse/lib/pdf-parse.js")) as PdfParseModule;
  } catch (cause) {
    throw new Error(
      `No se pudo cargar pdf-parse: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }
  const fn: PdfParseFn | undefined =
    typeof mod === "function" ? mod : mod.default;
  if (!fn) throw new Error("pdf-parse no exporta funcion principal");
  const result = await fn(buffer);
  const text = result.text ?? "";
  console.log(
    `[pdf-text/pdf-parse] chars=${text.length} sample="${text.slice(0, 120).replace(/\s+/g, " ").trim()}"`,
  );
  return text;
}
