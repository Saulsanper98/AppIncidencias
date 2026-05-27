import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  FolderOpen,
  Pencil,
  Sparkles,
  Tag,
  Ticket as TicketIcon,
  User as UserIcon,
} from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ArticleActions } from "@/components/kb/ArticleActions";
import { ArticleToc } from "@/components/kb/ArticleToc";
import { MarkdownView } from "@/components/kb/MarkdownView";
import { extractHeadings } from "@/lib/kb-toc";
import { prisma } from "@/lib/prisma";
import { canManageKnowledge } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  borrador: {
    label: "Borrador",
    tone: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  },
  publicado: {
    label: "Publicado",
    tone: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  },
  archivado: {
    label: "Archivado",
    tone: "bg-[var(--color-surface-2)] text-[var(--color-text-3)]",
  },
};

function readingMinutes(md: string): number {
  if (!md) return 1;
  const words = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export default async function KbArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect("/login?auth=required");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user?.isActive) redirect("/login?auth=required");

  const isEditor = canManageKnowledge(user.role);
  const article = await prisma.kbArticle.findUnique({
    where: { slug },
    include: {
      category: { select: { id: true, slug: true, name: true } },
      author: { select: { name: true } },
    },
  });
  if (!article) notFound();
  if (article.status !== "publicado" && !isEditor) notFound();

  if (!isEditor) {
    void prisma.kbArticle
      .update({ where: { id: article.id }, data: { views: { increment: 1 } } })
      .catch(() => {});
  }

  const tags = article.tags
    ? article.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const ticketIds = article.linkedTicketIds
    ? article.linkedTicketIds.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const updatedFmt = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Atlantic/Canary",
  }).format(article.updatedAt);

  const publishedFmt = article.publishedAt
    ? new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "Atlantic/Canary",
      }).format(article.publishedAt)
    : null;

  const headings = extractHeadings(article.contentMd);
  const minutes = readingMinutes(article.contentMd);
  const statusInfo = STATUS_LABELS[article.status] ?? STATUS_LABELS.publicado;

  return (
    <article className="mx-auto max-w-6xl space-y-4 pb-12">
      {/* Breadcrumb */}
      <nav aria-label="Migas de pan" className="flex items-center gap-1 text-[11.5px] text-[var(--color-text-3)]">
        <Link
          href="/kb"
          className="inline-flex items-center gap-1 transition-colors hover:text-[var(--color-text-1)]"
        >
          <ChevronLeft size={12} strokeWidth={1.6} aria-hidden />
          Base de conocimiento
        </Link>
        {article.category ? (
          <>
            <ChevronRight size={11} strokeWidth={1.6} aria-hidden className="opacity-60" />
            <Link
              href={`/kb?categoria=${article.category.slug}`}
              className="inline-flex items-center gap-1 transition-colors hover:text-[var(--color-text-1)]"
            >
              <FolderOpen size={11} strokeWidth={1.6} aria-hidden />
              {article.category.name}
            </Link>
          </>
        ) : null}
        <ChevronRight size={11} strokeWidth={1.6} aria-hidden className="opacity-60" />
        <span className="truncate font-medium text-[var(--color-text-2)]">{article.title}</span>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* Contenido principal */}
        <div className="min-w-0 space-y-4">
          {/* Hero header */}
          <header className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface-1)] via-[var(--color-surface-1)] to-[var(--color-accent-light)]/30 p-5">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-[var(--color-accent)]/15 blur-3xl"
            />
            <div className="relative space-y-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                {article.category ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2.5 py-0.5 font-medium text-[var(--color-text-2)]">
                    <FolderOpen size={10} strokeWidth={1.7} aria-hidden />
                    {article.category.name}
                  </span>
                ) : null}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${statusInfo.tone}`}
                >
                  <Sparkles size={10} strokeWidth={1.7} aria-hidden />
                  {statusInfo.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2.5 py-0.5 text-[var(--color-text-3)]">
                  <Eye size={10} strokeWidth={1.7} aria-hidden />
                  <span className="num-tabular">{article.views}</span>{" "}
                  {article.views === 1 ? "vista" : "vistas"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2.5 py-0.5 text-[var(--color-text-3)]">
                  <CalendarDays size={10} strokeWidth={1.7} aria-hidden />
                  {minutes} min de lectura
                </span>
              </div>

              <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[var(--color-text-1)]">
                {article.title}
              </h1>
              {article.summary ? (
                <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--color-text-2)]">
                  {article.summary}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--color-text-3)]">
                  {article.author?.name ? (
                    <span className="inline-flex items-center gap-1">
                      <UserIcon size={11} strokeWidth={1.6} aria-hidden />
                      <span className="text-[var(--color-text-2)]">{article.author.name}</span>
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={11} strokeWidth={1.6} aria-hidden />
                    Actualizado {updatedFmt}
                  </span>
                  {publishedFmt && publishedFmt !== updatedFmt ? (
                    <span className="text-[10.5px] opacity-80">{"\u00B7"} Publicado {publishedFmt}</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ArticleActions />
                  {isEditor ? (
                    <Link
                      href={`/admin/kb?edit=${article.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-accent)] transition-opacity hover:opacity-90"
                    >
                      <Pencil size={11} strokeWidth={1.6} aria-hidden />
                      Editar
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          {/* Cuerpo del artículo */}
          <section className="ccmgc-card p-6">
            <MarkdownView source={article.contentMd} />
          </section>

          {/* Footer del artículo */}
          {tags.length > 0 || ticketIds.length > 0 ? (
            <section className="ccmgc-card space-y-3 p-4 print:hidden">
              {tags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">Etiquetas</span>
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-0.5 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-2)]"
                    >
                      <Tag size={9} strokeWidth={1.6} aria-hidden />
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              {ticketIds.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
                    Tickets ejemplares
                  </span>
                  {ticketIds.map((id) => (
                    <Link
                      key={id}
                      href={`/tickets/${id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
                    >
                      <TicketIcon size={10} strokeWidth={1.6} aria-hidden />
                      <span className="num-tabular">{id.slice(-8).toUpperCase()}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Volver */}
          <div className="flex items-center justify-between pt-1 print:hidden">
            <Link
              href="/kb"
              className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-1)]"
            >
              <ChevronLeft size={13} strokeWidth={1.6} aria-hidden /> Volver al índice
            </Link>
            <span className="text-[10.5px] text-[var(--color-text-3)]">
              {article.author?.name ? `Mantenido por ${article.author.name}` : "Centro de Control de Movilidad"}
            </span>
          </div>
        </div>

        {/* Sidebar TOC */}
        <aside className="print:hidden">
          <ArticleToc headings={headings} />
        </aside>
      </div>
    </article>
  );
}
