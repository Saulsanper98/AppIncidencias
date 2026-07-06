"use client";

import { parseVideoEmbed } from "@/lib/kb-media";

type Props = {
  url: string;
  className?: string;
};

export function KbVideoEmbed({ url, className }: Props) {
  const embed = parseVideoEmbed(url);
  if (!embed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="my-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-[13px] font-medium text-[var(--color-accent)] hover:underline"
      >
        Ver vídeo externo
      </a>
    );
  }

  const src =
    embed.provider === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${embed.id}`
      : `https://player.vimeo.com/video/${embed.id}`;

  return (
    <figure className={`my-5 overflow-hidden rounded-xl border border-[var(--color-border)] bg-black/40 shadow-lg ${className ?? ""}`}>
      <div className="relative aspect-video w-full">
        <iframe
          src={src}
          title="Vídeo embebido"
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </figure>
  );
}
