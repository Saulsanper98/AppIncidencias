"use client";

/**
 * Renderiza Markdown con estilo CCMGC y soporte de medios enriquecidos.
 *
 * - GFM (tablas, listas de tareas).
 * - Imágenes y vídeos locales/remotos con marco visual.
 * - Embeds YouTube/Vimeo vía sintaxis @[video](url) o enlaces en bloque.
 * - PDFs y archivos como tarjetas de descarga.
 */

import ReactMarkdown from "react-markdown";
import { FileText, ExternalLink } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import remarkGfm from "remark-gfm";

import { KbVideoEmbed } from "@/components/kb/KbVideoEmbed";
import { reactNodeToText, slugifyHeading } from "@/lib/kb-toc";
import {
  isPdfFileUrl,
  isVideoFileUrl,
  parseVideoEmbed,
} from "@/lib/kb-media";

type Props = {
  source: string;
  className?: string;
};

const VIDEO_BLOCK_RE = /@\[video\]\(([^)]+)\)/g;

function makeHeadingFactory() {
  const seen = new Map<string, number>();
  return function id(node: unknown): string {
    const base = slugifyHeading(reactNodeToText(node));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}

function splitVideoBlocks(source: string): Array<{ type: "md" | "video"; content: string }> {
  const parts: Array<{ type: "md" | "video"; content: string }> = [];
  let last = 0;
  for (const match of source.matchAll(VIDEO_BLOCK_RE)) {
    const idx = match.index ?? 0;
    if (idx > last) parts.push({ type: "md", content: source.slice(last, idx) });
    parts.push({ type: "video", content: match[1].trim() });
    last = idx + match[0].length;
  }
  if (last < source.length) parts.push({ type: "md", content: source.slice(last) });
  return parts.length ? parts : [{ type: "md", content: source }];
}

export function MarkdownView({ source, className }: Props) {
  const blocks = useMemo(() => splitVideoBlocks(source), [source]);

  return (
    <div
      className={`kb-markdown text-[15px] leading-relaxed text-[var(--color-text-1)] ${className ?? ""}`}
    >
      {blocks.map((block, i) =>
        block.type === "video" ? (
          <KbVideoEmbed key={`v-${i}`} url={block.content} />
        ) : (
          <MarkdownChunk key={`m-${i}`} source={block.content} />
        ),
      )}
    </div>
  );
}

function MarkdownChunk({ source }: { source: string }) {
  const headingId = makeHeadingFactory();

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1
            id={headingId(children)}
            className="group mt-6 mb-3 scroll-mt-24 border-b border-[var(--color-border)] pb-2 text-[22px] font-semibold tracking-tight text-[var(--color-text-1)]"
          >
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2
            id={headingId(children)}
            className="group mt-6 mb-2.5 scroll-mt-24 text-[18px] font-semibold tracking-tight text-[var(--color-text-1)]"
          >
            <span className="mr-2 inline-block h-4 w-1 rounded-full bg-[var(--color-accent)] align-middle" aria-hidden />
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3
            id={headingId(children)}
            className="group mt-5 mb-2 scroll-mt-24 text-[16px] font-semibold text-[var(--color-text-1)]"
          >
            {children}
          </h3>
        ),
        p: ({ children, node }) => {
          const text = reactNodeToText(children).trim();
          const linkChild = node?.children?.find(
            (c) => c.type === "element" && (c as { tagName?: string }).tagName === "a",
          ) as { properties?: { href?: string }; children?: unknown[] } | undefined;
          const href = linkChild?.properties?.href;
          const isSingleLink =
            node?.children?.length === 1 && linkChild && reactNodeToText(linkChild.children) === text;
          const embed = isSingleLink && href ? parseVideoEmbed(href) : null;
          if (embed) return <KbVideoEmbed url={href!} />;
          return <p className="my-3 text-[var(--color-text-2)]">{children}</p>;
        },
        ul: ({ children }) => (
          <ul className="my-3 ml-5 list-disc space-y-1.5 text-[var(--color-text-2)] marker:text-[var(--color-accent)]">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-3 ml-5 list-decimal space-y-1.5 text-[var(--color-text-2)] marker:text-[var(--color-text-3)]">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="pl-1">{children}</li>,
        a: ({ children, href }) => {
          if (href && isPdfFileUrl(href)) {
            return <KbFileCard href={href} label={reactNodeToText(children) || "Documento PDF"} kind="pdf" />;
          }
          const embed = parseVideoEmbed(href);
          if (embed) return <KbVideoEmbed url={href!} />;
          return (
            <a
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
              className="inline-flex items-center gap-0.5 font-medium text-[var(--color-accent)] underline-offset-2 transition-colors hover:underline"
            >
              {children}
              {href?.startsWith("http") ? <ExternalLink size={11} className="opacity-70" aria-hidden /> : null}
            </a>
          );
        },
        img: ({ src, alt }) => {
          const url = typeof src === "string" ? src : "";
          if (!url) return null;
          if (isVideoFileUrl(url)) {
            return (
              <figure className="my-5 overflow-hidden rounded-xl border border-[var(--color-border)] bg-black/30 shadow-md">
                <video src={url} controls playsInline className="w-full max-h-[min(70vh,520px)]" preload="metadata">
                  Tu navegador no soporta vídeo HTML5.
                </video>
                {alt ? (
                  <figcaption className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-2 text-center text-[12px] text-[var(--color-text-3)]">
                    {alt}
                  </figcaption>
                ) : null}
              </figure>
            );
          }
          return <KbImage src={url} alt={alt ?? ""} />;
        },
        strong: ({ children }) => (
          <strong className="font-semibold text-[var(--color-text-1)]">{children}</strong>
        ),
        em: ({ children }) => <em className="italic text-[var(--color-text-2)]">{children}</em>,
        code: ({ children, className: codeClass }) => {
          const isBlock = codeClass?.startsWith("language-");
          if (isBlock) {
            return (
              <code className="block whitespace-pre-wrap rounded-md bg-[var(--color-surface-2)] px-3 py-2 font-mono text-[12.5px] text-[var(--color-text-1)]">
                {children}
              </code>
            );
          }
          return (
            <code className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--color-accent)]">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-4 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 shadow-inner">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-4 rounded-r-lg border-l-4 border-[var(--color-accent)] bg-[var(--color-accent-light)]/50 py-2 pl-4 pr-3 text-[var(--color-text-2)]">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-6 border-[var(--color-border)]" />,
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="ccmgc-table w-full text-[13px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-[var(--color-surface-2)] text-[var(--color-text-2)]">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="border border-[var(--color-border)] px-3 py-2 text-left font-medium">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-2)]">{children}</td>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  );
}

function KbImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <figure className="my-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group block w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 shadow-md transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="mx-auto max-h-[min(70vh,480px)] w-full object-contain transition-transform duration-300 group-hover:scale-[1.01]"
            loading="lazy"
          />
        </button>
        {alt ? (
          <figcaption className="mt-2 text-center text-[12px] text-[var(--color-text-3)]">{alt}</figcaption>
        ) : null}
      </figure>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal
          onClick={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl" />
        </div>
      ) : null}
    </Fragment>
  );
}

function KbFileCard({
  href,
  label,
  kind,
}: {
  href: string;
  label: string;
  kind: "pdf";
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="my-4 flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-gradient-to-r from-[var(--color-surface-2)] to-[var(--color-surface-1)] p-4 transition-all hover:border-[var(--color-accent)]/40 hover:shadow-md"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)]">
        <FileText size={22} strokeWidth={1.6} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-[var(--color-text-1)]">{label}</span>
        <span className="text-[11px] uppercase tracking-wide text-[var(--color-text-3)]">
          {kind === "pdf" ? "PDF · Abrir o descargar" : "Archivo"}
        </span>
      </span>
      <ExternalLink size={16} className="shrink-0 text-[var(--color-text-3)]" aria-hidden />
    </a>
  );
}
