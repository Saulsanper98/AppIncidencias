import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { extname } from "path";
import { NextResponse } from "next/server";
import type { ReadableStream as NodeReadable } from "node:stream/web";
import { Readable } from "stream";

import { isMediaAuthError, requireMediaSession } from "@/lib/api-auth";
import { resolveSafeUploadsPath } from "@/lib/safe-upload-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".bin": "application/octet-stream",
};

export async function GET(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const session = requireMediaSession(request);
  if (isMediaAuthError(session)) return session;

  const { path: segments } = await ctx.params;
  const filePath = resolveSafeUploadsPath(segments ?? []);
  if (!filePath) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new NextResponse("Not found", { status: 404 });

    const ext = extname(filePath).toLowerCase();
    const mime = EXT_MIME[ext] ?? "application/octet-stream";
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as NodeReadable<Uint8Array>;

    return new NextResponse(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
