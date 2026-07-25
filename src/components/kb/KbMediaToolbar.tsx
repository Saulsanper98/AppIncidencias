"use client";

import { FileUp, ImageIcon, Link2, Loader2, Video } from "lucide-react";
import { useRef, useState } from "react";

import { KB_UPLOAD_ACCEPT } from "@/lib/kb-uploads";
import { markdownForUploadedMedia, markdownForVideoEmbed } from "@/lib/kb-media";

type Props = {
  articleId: string | undefined;
  onInsert: (markdown: string) => void;
  disabled?: boolean;
};

export function KbMediaToolbar({ articleId, onInsert, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const needsSave = !articleId;

  const uploadFiles = async (files: FileList | File[]) => {
    if (!articleId) {
      setUploadError("Guarda el artículo primero para poder subir archivos.");
      return;
    }
    const list = [...files];
    if (list.length === 0) return;

    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      for (const f of list) form.append("files", f);
      const res = await fetch(`/api/kb/articles/${encodeURIComponent(articleId)}/attachments`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        files?: Array<{ url: string; fileName: string; kind: "image" | "video" | "file" }>;
      };
      if (!res.ok) {
        setUploadError(data.message ?? "Error al subir");
        return;
      }
      const inserted = (data.files ?? [])
        .map((f) => markdownForUploadedMedia(f.kind, f.url, f.fileName))
        .join("");
      if (inserted) onInsert(inserted);
    } catch {
      setUploadError("Error de red al subir");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const insertUrl = () => {
    const url = window.prompt("URL (imagen, vídeo, PDF o enlace):", "https://");
    if (!url?.trim()) return;
    const trimmed = url.trim();
    if (/youtube\.com|youtu\.be|vimeo\.com/i.test(trimmed)) {
      onInsert(markdownForVideoEmbed(trimmed));
      return;
    }
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(trimmed)) {
      onInsert(`\n\n![Imagen](${trimmed})\n\n`);
      return;
    }
    if (/\.(mp4|webm|mov)(\?|$)/i.test(trimmed)) {
      onInsert(`\n\n![Vídeo](${trimmed})\n\n`);
      return;
    }
    if (/\.pdf(\?|$)/i.test(trimmed)) {
      onInsert(`\n\n[📎 Documento PDF](${trimmed})\n\n`);
      return;
    }
    onInsert(`\n\n[Enlace](${trimmed})\n\n`);
  };

  const insertYoutube = () => {
    const url = window.prompt("URL de YouTube o Vimeo:", "https://www.youtube.com/watch?v=");
    if (!url?.trim()) return;
    onInsert(markdownForVideoEmbed(url.trim()));
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <input
        ref={inputRef}
        type="file"
        accept={KB_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void uploadFiles(e.target.files);
        }}
      />
      <MediaBtn
        title={needsSave ? "Guarda primero el artículo" : "Subir imagen"}
        icon={uploading ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} strokeWidth={1.7} />}
        onClick={() => {
          if (needsSave) {
            setUploadError("Guarda el artículo primero para subir archivos.");
            return;
          }
          inputRef.current?.click();
        }}
        disabled={disabled || uploading}
        accent
      />
      <MediaBtn
        title="Subir vídeo o PDF"
        icon={uploading ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} strokeWidth={1.7} />}
        onClick={() => {
          if (needsSave) {
            setUploadError("Guarda el artículo primero para subir archivos.");
            return;
          }
          inputRef.current?.click();
        }}
        disabled={disabled || uploading}
      />
      <MediaBtn title="Insertar vídeo YouTube/Vimeo" icon={<Video size={12} strokeWidth={1.7} />} onClick={insertYoutube} disabled={disabled} />
      <MediaBtn title="Insertar URL" icon={<Link2 size={12} strokeWidth={1.7} />} onClick={insertUrl} disabled={disabled} />
      {uploadError ? (
        <span className="ml-1 max-w-[200px] truncate text-[10px] text-[var(--color-error)]" title={uploadError}>
          {uploadError}
        </span>
      ) : null}
    </div>
  );
}

function MediaBtn({
  title,
  icon,
  onClick,
  disabled,
  accent,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text-1)] disabled:cursor-not-allowed disabled:opacity-50 ${
        accent ? "text-[var(--color-accent)] hover:text-[var(--color-accent)]" : ""
      } ${className ?? ""}`}
    >
      {icon}
    </button>
  );
}
