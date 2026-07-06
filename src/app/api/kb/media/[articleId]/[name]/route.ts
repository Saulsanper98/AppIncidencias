import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { extname, join } from "path";
import { NextResponse } from "next/server";
import type { ReadableStream as NodeReadable } from "node:stream/web";
import { Readable } from "stream";

import { isMediaAuthError, requireMediaSession } from "@/lib/api-auth";
import { kbUploadDiskPath } from "@/lib/kb-uploads-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME_LEN = 128;

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
};

export async function GET(
  request: Request,
  ctx: { params: Promise<{ articleId: string; name: string }> },
) {
  const session = requireMediaSession(request);
  if (isMediaAuthError(session)) return session;

  const { articleId, name } = await ctx.params;
  if (
    !articleId ||
    !name ||
    name.length > MAX_NAME_LEN ||
    !/^[a-zA-Z0-9_.-]+$/.test(name) ||
    name.startsWith(".") ||
    name.includes("..")
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = kbUploadDiskPath(articleId, name);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new NextResponse("Not found", { status: 404 });

    const ext = extname(name).toLowerCase();
    const mime = EXT_MIME[ext] ?? "application/octet-stream";
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as NodeReadable<Uint8Array>;

    const headers = new Headers({
      "Content-Type": mime,
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    if (ext === ".pdf") {
      headers.set("Content-Disposition", `inline; filename="${name}"`);
    }

    return new NextResponse(webStream as unknown as ReadableStream<Uint8Array>, {
      status: 200,
      headers,
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
