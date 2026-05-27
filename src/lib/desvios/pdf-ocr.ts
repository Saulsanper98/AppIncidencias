/**
 * OCR de circulares en PDF (o imagenes) cuando la extraccion de texto nativa
 * falla. Pasos:
 *
 *   PDF  ?? pdfjs(getOperatorList) ?? imagenes embebidas (PNG) ?? tesseract.js ?? texto
 *   IMG  ????????????????????????????????????????????????????????? tesseract.js ?? texto
 *
 * Por que NO usamos `page.render` + canvas para extraer un PNG por pagina:
 *   - pdfjs-dist v5 dispara `Error: Value is none of these types String, Path`
 *     en `CanvasGraphics.consumePath` cuando trata de renderizar paths
 *     complejos contra `@napi-rs/canvas`. Es un fallo de compatibilidad de
 *     Path2D entre el shim de Node y la API de pdfjs.
 *   - Las "Circulares Informativas" de Global son PDFs escaneados o
 *     exportados desde Word con UNA imagen rasterizada que cubre la pagina
 *     completa. No hay texto vectorial, asi que rasterizar a 2x es
 *     redundante: la imagen embebida ya es la fuente unica de verdad.
 *
 * En su lugar, recorremos la `operatorList` de cada pagina, identificamos los
 * operadores `paintImageXObject` y resolvemos cada objeto desde `page.objs`.
 * Convertimos el bitmap raw a PNG usando `@napi-rs/canvas` solo para el
 * `putImageData` + `encode("png")` (operaciones planas, no `consumePath`).
 *
 * Notas:
 *   - Tesseract descarga `spa.traineddata` (~10 MB) la primera vez. Se cachea
 *     en `<cwd>/.tess-cache/`.
 *   - Los modulos pesados (`@napi-rs/canvas`, `tesseract.js`) se cargan con
 *     `new Function("m", "return import(m)")` para evitar el analisis estatico
 *     del build de Next.
 *   - Limitamos a 5 paginas por PDF: las circulares son siempre 1, pero el
 *     limite evita escenarios patologicos (PDFs de 50 paginas que harian
 *     OCR de 20 minutos).
 */

import { Buffer } from "node:buffer";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const MAX_PAGES = 5;
// Operadores de pdfjs que pintan una imagen rasterizada (XObject). Los
// numeros estan congelados en `pdfjs-dist/legacy/build/pdf.mjs` (ver enum
// `OPS`).
const OP_PAINT_IMAGE_XOBJECT = 85;
const OP_PAINT_IMAGE_XOBJECT_REPEAT = 88;
// `ImageKind` segun pdfjs: 1 = GRAYSCALE_1BPP, 2 = RGB_24BPP, 3 = RGBA_32BPP.
const IMAGE_KIND_GRAYSCALE_1BPP = 1;
const IMAGE_KIND_RGB_24BPP = 2;
const IMAGE_KIND_RGBA_32BPP = 3;
// Si la imagen extraida es mas pequena que esto, asumimos que es un logo o un
// asset decorativo (las imagenes utiles del cuerpo de la circular son >= 600
// px por su lado mas largo). Asi evitamos OCR sobre el escudo del cabildo o
// la firma del jefe de sala.
const MIN_IMAGE_LONG_SIDE = 600;

const dynamicImport = new Function(
  "m",
  "return import(m)",
) as (m: string) => Promise<unknown>;

type NapiImageData = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};
type NapiCanvasContext2D = {
  createImageData(width: number, height: number): NapiImageData;
  putImageData(imageData: NapiImageData, dx: number, dy: number): void;
};
type NapiCanvasInstance = {
  getContext(type: "2d"): NapiCanvasContext2D;
  encode(format: "png"): Promise<Buffer>;
};
type NapiCanvas = {
  createCanvas(width: number, height: number): NapiCanvasInstance;
};

type PdfjsOperatorList = {
  fnArray: number[];
  argsArray: unknown[][];
};
type PdfjsPdfObjects = {
  get(objId: string, callback?: (value: unknown) => void): unknown;
  has?(objId: string): boolean;
};
type PdfjsPage = {
  getOperatorList(): Promise<PdfjsOperatorList>;
  objs: PdfjsPdfObjects;
  commonObjs: PdfjsPdfObjects;
};
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

// Estructura del objeto que devuelve `page.objs.get(name)` para una imagen
// XObject en pdfjs node. Puede venir con `data` raw o con `bitmap` (caso
// JPEG en navegador, no aplica en Node pero lo dejamos por seguridad).
type PdfjsImageObject = {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8ClampedArray | Uint8Array;
  bitmap?: unknown;
};

type TesseractWorker = {
  recognize(input: string | Buffer | Uint8Array): Promise<{ data: { text: string } }>;
  terminate(): Promise<void>;
};
type TesseractModule = {
  createWorker(
    lang?: string,
    oem?: number,
    options?: {
      langPath?: string;
      cachePath?: string;
      logger?: (msg: { status?: string; progress?: number }) => void;
    },
  ): Promise<TesseractWorker>;
};

/**
 * Extrae las imagenes embebidas de cada pagina del PDF y aplica OCR sobre
 * cada una. Devuelve el texto concatenado. Si la extraccion falla en
 * cualquier paso, propaga el error con un mensaje claro.
 */
export async function ocrPdfBuffer(buffer: Buffer): Promise<string> {
  const pngs = await extractEmbeddedImagesAsPng(buffer);
  if (pngs.length === 0) {
    throw new Error(
      "El PDF no contiene imagenes embebidas. Si tampoco trae texto, " +
        "probablemente sea un PDF vacio o protegido.",
    );
  }
  const texts: string[] = [];
  for (let i = 0; i < pngs.length; i++) {
    const text = await ocrImageBuffer(pngs[i]);
    texts.push(text);
  }
  return texts.join("\n\n");
}

/**
 * OCR directo sobre una imagen (PNG/JPG). Util si el operador prefiere
 * subir directamente una captura de pantalla del PDF en vez del PDF entero.
 *
 * Tesseract.js (en node) acepta el `image` en varios formatos: ruta string,
 * Buffer, Uint8Array, base64 data URL. Nosotros pasamos Buffer porque es lo
 * mas barato (no escribimos a disco). Si esto falla, capturamos stack completo
 * para diagnostico.
 */
export async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  let tess: TesseractModule;
  try {
    tess = (await dynamicImport("tesseract.js")) as TesseractModule;
  } catch (err) {
    const reason = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    throw new Error(`No se pudo cargar tesseract.js: ${reason}`);
  }

  const cachePath = await ensureTessCacheDir();
  let worker: TesseractWorker;
  try {
    worker = await tess.createWorker("spa", 1, {
      cachePath,
      logger: (msg) => {
        if (msg.status && msg.progress !== undefined && msg.progress === 1) {
          console.log(`[ocr] ${msg.status} done`);
        }
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    throw new Error(`No se pudo crear el worker de tesseract.js: ${reason}`);
  }

  try {
    const t0 = Date.now();
    const result = await worker.recognize(buffer);
    const text = result?.data?.text ?? "";
    console.log(
      `[ocr] image_bytes=${buffer.byteLength} elapsed_ms=${Date.now() - t0} chars=${text.length} sample="${text.slice(0, 120).replace(/\s+/g, " ").trim()}"`,
    );
    return text;
  } catch (err) {
    // Log estructurado para diagnostico (no se pierde stack ni tipo).
    const detail = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error("[ocr] worker.recognize fallo", detail);
    throw new Error(
      `worker.recognize fallo (bytes=${buffer.byteLength}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    await worker.terminate().catch(() => {});
  }
}

async function extractEmbeddedImagesAsPng(buffer: Buffer): Promise<Buffer[]> {
  const [pdfjs, canvasMod] = await Promise.all([
    dynamicImport("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfjsModule>,
    dynamicImport("@napi-rs/canvas") as Promise<NapiCanvas>,
  ]);

  if (pdfjs.GlobalWorkerOptions) {
    const workerUrl = resolveWorkerUrl();
    if (workerUrl) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }

  const data = new Uint8Array(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: false,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;

  const pagesToProcess = Math.min(pdf.numPages, MAX_PAGES);
  const out: Buffer[] = [];
  for (let n = 1; n <= pagesToProcess; n++) {
    const page = await pdf.getPage(n);
    const opList = await page.getOperatorList();
    const imageIds = collectImageObjIds(opList);
    if (imageIds.length === 0) {
      console.log(`[ocr/pdf] pagina ${n}: 0 imagenes embebidas detectadas`);
      continue;
    }
    for (const id of imageIds) {
      const img = await waitForObject(page, id);
      if (!img) {
        console.warn(`[ocr/pdf] pagina ${n}: objeto ${id} no se resolvio`);
        continue;
      }
      const longSide = Math.max(img.width, img.height);
      if (longSide < MIN_IMAGE_LONG_SIDE) {
        console.log(
          `[ocr/pdf] pagina ${n}: imagen ${id} ignorada (${img.width}x${img.height} px, demasiado pequena)`,
        );
        continue;
      }
      try {
        const png = await encodeImageObjectAsPng(canvasMod, img);
        console.log(
          `[ocr/pdf] pagina ${n}: imagen ${id} ${img.width}x${img.height} -> png ${png.byteLength} bytes`,
        );
        out.push(png);
      } catch (err) {
        console.warn(
          `[ocr/pdf] pagina ${n}: imagen ${id} no se pudo codificar a PNG:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  return out;
}

/**
 * Recorre la `operatorList` de una pagina y devuelve los `objId`s unicos de
 * todos los `paintImageXObject*`.
 */
function collectImageObjIds(opList: PdfjsOperatorList): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    if (fn === OP_PAINT_IMAGE_XOBJECT || fn === OP_PAINT_IMAGE_XOBJECT_REPEAT) {
      const args = opList.argsArray[i];
      const id = args && args.length > 0 ? args[0] : null;
      if (typeof id === "string" && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

/**
 * Resuelve un objeto del store de pdfjs (commonObjs o objs, segun el
 * prefijo). Devuelve null si la promesa se queda colgada mas de 15s
 * (defensivo: no queremos colgar el endpoint).
 */
async function waitForObject(
  page: PdfjsPage,
  objId: string,
): Promise<PdfjsImageObject | null> {
  const store = objId.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise<PdfjsImageObject | null>((resolve) => {
    let done = false;
    const finish = (value: PdfjsImageObject | null) => {
      if (!done) {
        done = true;
        resolve(value);
      }
    };
    const timer = setTimeout(() => finish(null), 15000);
    try {
      store.get(objId, (value) => {
        clearTimeout(timer);
        finish((value as PdfjsImageObject) ?? null);
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/**
 * Convierte un `PdfjsImageObject` (raw bitmap segun pdfjs) a un PNG buffer.
 *
 * Solo usamos `createImageData` + `putImageData` + `encode("png")` de
 * `@napi-rs/canvas`, evitando totalmente el motor de paths que es donde
 * pdfjs-dist disparaba el error "Value is none of these types String, Path".
 */
async function encodeImageObjectAsPng(
  canvasMod: NapiCanvas,
  img: PdfjsImageObject,
): Promise<Buffer> {
  const { width, height } = img;
  if (!width || !height) {
    throw new Error(`Dimensiones invalidas (${width}x${height})`);
  }
  if (!img.data) {
    throw new Error("Imagen sin .data raw (posible JPEG sin decodificar)");
  }

  const canvas = canvasMod.createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const out = ctx.createImageData(width, height);
  const dest = out.data;
  const src = img.data;

  if (img.kind === IMAGE_KIND_RGBA_32BPP) {
    dest.set(src.subarray(0, width * height * 4));
  } else if (img.kind === IMAGE_KIND_RGB_24BPP) {
    let sp = 0;
    let dp = 0;
    const total = width * height;
    for (let i = 0; i < total; i++) {
      dest[dp++] = src[sp++];
      dest[dp++] = src[sp++];
      dest[dp++] = src[sp++];
      dest[dp++] = 255;
    }
  } else if (img.kind === IMAGE_KIND_GRAYSCALE_1BPP) {
    // 1 bit por pixel, packed MSB. Bit 1 = blanco, bit 0 = negro.
    let dp = 0;
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const byte = src[y * rowBytes + (x >> 3)];
        const bit = (byte >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        dest[dp++] = v;
        dest[dp++] = v;
        dest[dp++] = v;
        dest[dp++] = 255;
      }
    }
  } else {
    // Sin `kind` definido: asumimos 4 canales (RGBA) si los bytes cuadran,
    // o 3 (RGB) en su defecto. Es defensivo para PDFs con codecs raros.
    const total = width * height;
    if (src.byteLength === total * 4) {
      dest.set(src.subarray(0, total * 4));
    } else if (src.byteLength === total * 3) {
      let sp = 0;
      let dp = 0;
      for (let i = 0; i < total; i++) {
        dest[dp++] = src[sp++];
        dest[dp++] = src[sp++];
        dest[dp++] = src[sp++];
        dest[dp++] = 255;
      }
    } else {
      throw new Error(
        `Formato de imagen no soportado: kind=${img.kind ?? "?"} bytes=${src.byteLength} (${width}x${height})`,
      );
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.encode("png");
}

async function ensureTessCacheDir(): Promise<string> {
  // Cacheamos los modelos de tesseract en `<cwd>/.tess-cache` (fuera de
  // public/ para no exponerlos por HTTP).
  const dir = path.join(process.cwd(), ".tess-cache");
  await mkdir(dir, { recursive: true });
  return dir;
}

function resolveWorkerUrl(): string | null {
  try {
    const req = createRequire(pathToFileURL(process.cwd() + path.sep).href);
    const workerPath = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    return pathToFileURL(workerPath).href;
  } catch {
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
}
