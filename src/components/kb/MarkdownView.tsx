"use client";

/**
 * Renderiza Markdown con estilo CCMGC.
 *
 * - Soporta GFM (tablas, listas de tareas, strikethrough).
 * - Por seguridad, react-markdown ya escapa HTML raw por defecto.
 * - Estilos consistentes con el tema oscuro.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { reactNodeToText, slugifyHeading } from "@/lib/kb-toc";

type Props = {
  source: string;
  className?: string;
};

/**
 * Wrapper que genera un id único por heading para anclar el TOC.
 * Mantiene un mapa local de slugs ya vistos para diferenciar repetidos
 * (igual que la lógica de `extractHeadings`).
 */
function makeHeadingFactory() {
  const seen = new Map<string, number>();
  return function id(node: unknown): string {
    const base = slugifyHeading(reactNodeToText(node));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}

export function MarkdownView({ source, className }: Props) {
  const headingId = makeHeadingFactory();
  return (
    <div className={`kb-markdown text-[14px] leading-relaxed text-[var(--color-text-1)] ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              id={headingId(children)}
              className="group mt-5 mb-3 scroll-mt-20 text-[20px] font-semibold tracking-tight text-[var(--color-text-1)]"
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              id={headingId(children)}
              className="group mt-5 mb-2.5 scroll-mt-20 text-[17px] font-semibold tracking-tight text-[var(--color-text-1)]"
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              id={headingId(children)}
              className="group mt-4 mb-2 scroll-mt-20 text-[15px] font-semibold text-[var(--color-text-1)]"
            >
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-2 text-[var(--color-text-2)]">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-5 list-disc space-y-1 text-[var(--color-text-2)] marker:text-[var(--color-text-3)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-5 list-decimal space-y-1 text-[var(--color-text-2)] marker:text-[var(--color-text-3)]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
              className="font-medium text-[var(--color-accent)] underline-offset-2 transition-colors hover:underline"
            >
              {children}
            </a>
          ),
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
              <code className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--color-text-1)]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-light)] py-1 pl-3 text-[var(--color-text-2)]">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-[var(--color-border)]" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[var(--color-surface-2)] text-[var(--color-text-2)]">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-[var(--color-border)] px-2 py-1.5 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[var(--color-border)] px-2 py-1.5 text-[var(--color-text-2)]">
              {children}
            </td>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
