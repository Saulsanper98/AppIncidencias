import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { extname, join } from "path";
import type { ReadableStream as NodeReadable } from "node:stream/web";
import { Readable } from "stream";

import { isMediaAuthError, requireMediaSession } from "@/lib/api-auth";

const MAX_NAME_LEN = 128;

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(
  request: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const session = requireMediaSession(request);
  if (isMediaAuthError(session)) return session;

  const { name } = await ctx.params;

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

  const filePath = join(process.cwd(), "public", "uploads", "bus-photos", name);
  const info = await stat(filePath).catch(() => null);
  if (!info || !info.isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as NodeReadable<Uint8Array>;

  return new NextResponse(webStream as unknown as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
