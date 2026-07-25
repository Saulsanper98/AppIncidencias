import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";

import { fileExtFromMimeAndName } from "@/lib/ticket-uploads";

export const BUS_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const BUS_PHOTO_ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function busPhotosDir(): string {
  return join(process.cwd(), "public", "uploads", "bus-photos");
}

/** URL pública servida por el route handler dinámico (no por /uploads estático). */
export function busPhotoPublicUrl(fileName: string): string {
  return `/api/bus-media/${fileName}`;
}

export async function saveBusPhoto(busId: string, file: File): Promise<string> {
  if (file.size <= 0 || file.size > BUS_PHOTO_MAX_BYTES) {
    throw new Error(
      `El archivo supera el tamaño máximo permitido (${Math.round(BUS_PHOTO_MAX_BYTES / (1024 * 1024))} MB).`,
    );
  }
  if (!BUS_PHOTO_ALLOWED_MIMES.has(file.type)) {
    throw new Error("Formato no admitido. Usa GIF, PNG, JPG o WebP.");
  }

  const dir = busPhotosDir();
  await mkdir(dir, { recursive: true });

  const ext = fileExtFromMimeAndName(file.type, file.name);
  const safeBusId = busId.replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = `${safeBusId}-${Date.now()}${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, fileName), buffer);

  return busPhotoPublicUrl(fileName);
}

export async function tryDeleteLocalBusPhoto(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const match = url.match(/^(?:\/api\/bus-media|\/uploads\/bus-photos)\/([a-zA-Z0-9_.\-]+)$/);
  if (!match) return;
  const fileName = match[1];
  const filePath = join(process.cwd(), "public", "uploads", "bus-photos", fileName);
  try {
    await unlink(filePath);
  } catch {
    // Ignorar si el fichero ya no existe.
  }
}
