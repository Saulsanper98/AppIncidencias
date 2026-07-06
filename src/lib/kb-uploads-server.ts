import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import {
  KB_UPLOAD_MAX_FILES,
  kbMediaKind,
  kbMediaMaxBytes,
  kbMediaPublicPath,
  type KbMediaKind,
} from "@/lib/kb-uploads";

function fileExt(mime: string, originalName: string, kind: KbMediaKind): string {
  const m = mime.toLowerCase();
  if (kind === "image") {
    if (m === "image/jpeg" || m === "image/jpg") return ".jpg";
    if (m === "image/png") return ".png";
    if (m === "image/webp") return ".webp";
    if (m === "image/gif") return ".gif";
  }
  if (kind === "video") {
    if (m === "video/webm") return ".webm";
    if (m === "video/quicktime") return ".mov";
    return ".mp4";
  }
  if (kind === "file") {
    if (m === "application/pdf" || originalName.toLowerCase().endsWith(".pdf")) return ".pdf";
    const extMatch = originalName.match(/(\.[a-zA-Z0-9]{1,8})$/);
    if (extMatch) return extMatch[1].toLowerCase();
    return ".bin";
  }
  const extMatch = originalName.match(/(\.[a-zA-Z0-9]{1,8})$/);
  if (extMatch) return extMatch[1].toLowerCase();
  return ".mp4";
}

export type SavedKbMedia = {
  url: string;
  fileName: string;
  mimeType: string;
  kind: KbMediaKind;
  sizeBytes: number;
};

export async function saveKbUploadFiles(
  articleId: string,
  files: File[],
): Promise<{ saved: SavedKbMedia[] }> {
  const dir = join(process.cwd(), "public", "uploads", "kb", articleId);
  await mkdir(dir, { recursive: true });

  const saved: SavedKbMedia[] = [];
  for (const file of files.slice(0, KB_UPLOAD_MAX_FILES)) {
    if (file.size <= 0) continue;
    const fileName = file.name?.trim() || "archivo";
    const mimeType = file.type || "application/octet-stream";
    const kind = kbMediaKind(mimeType, fileName);
    if (!kind) continue;
    if (file.size > kbMediaMaxBytes(kind)) continue;

    const id = randomUUID();
    const ext = fileExt(mimeType, fileName, kind);
    const diskFileName = `${id}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(join(dir, diskFileName), buf);

    saved.push({
      url: kbMediaPublicPath(articleId, diskFileName),
      fileName,
      mimeType,
      kind,
      sizeBytes: file.size,
    });
  }
  return { saved };
}

export function kbUploadDiskPath(articleId: string, diskFileName: string): string {
  return join(process.cwd(), "public", "uploads", "kb", articleId, diskFileName);
}
