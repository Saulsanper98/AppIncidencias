import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { extname, join } from "path";
import { NextResponse } from "next/server";
import type { ReadableStream as NodeReadable } from "node:stream/web";
import { Readable } from "stream";

/**
 * Sirve avatars/banners almacenados en `public/uploads/{kind}/{name}` mediante
 * un route handler dinamico.
 *
 * Por que no usamos directamente `/uploads/...` (servido por la capa estatica
 * de Next): `next start` materializa al arrancar un manifiesto de los
 * ficheros que existen en `public/` y solo los sirve si estaban en disco en
 * ese instante. Los avatares se suben en runtime, por lo que cualquier
 * fichero creado DESPUES del arranque devuelve 404 y la `<img>` del
 * navegador queda en negro / con icono roto. Esto explica el bug que
 * reportaban los operadores al cambiar su foto justo despues de un rebuild.
 *
 * El handler lee del FS con `fs.createReadStream` (independiente del
 * manifest) y devuelve el binario con un Content-Type adecuado y cache
 * "immutable" porque el nombre incluye timestamp y nunca se reescribe.
 */

const ALLOWED_KINDS = new Set(["avatars", "banners"]);

// Limite defensivo: si alguien construye una URL muy larga, evitamos abrir el FS.
const MAX_NAME_LEN = 128;

// Solo aceptamos extensiones cuyo Content-Type sabemos servir correctamente.
// Coincide con `ACCOUNT_ALLOWED_MIMES` de account-uploads.ts.
const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ kind: string; name: string }> },
) {
  const { kind, name } = await ctx.params;

  if (!ALLOWED_KINDS.has(kind)) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Anti path-traversal: el nombre debe ser un fichero "plano" sin separadores
  // ni puntos iniciales. Coincide con lo que generamos en saveAccountImage.
  if (
    !name ||
    name.length > MAX_NAME_LEN ||
    !/^[a-zA-Z0-9_.-]+$/.test(name) ||
    name.startsWith(".") ||
    name.includes("..")
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = extname(name).toLowerCase();
  const mime = EXT_MIME[ext];
  if (!mime) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = join(process.cwd(), "public", "uploads", kind, name);
  const info = await stat(filePath).catch(() => null);
  if (!info || !info.isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Stream el archivo en lugar de cargarlo entero en memoria. Para 8 MB no
  // es critico pero la convencion es buena (y deja la puerta abierta a
  // archivos mas grandes en el futuro).
  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as NodeReadable<Uint8Array>;

  return new NextResponse(webStream as unknown as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(info.size),
      // El nombre lleva timestamp + userId: el archivo nunca cambia bajo el
      // mismo path. Cacheamos largo y como immutable para que el navegador
      // no haga revalidaciones innecesarias.
      "Cache-Control": "public, max-age=31536000, immutable",
      // Si en el futuro queremos soportar Range para previews de video,
      // habria que parsear `Range` y devolver 206. Hoy no es necesario.
    },
  });
}
