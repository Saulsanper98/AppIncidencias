/**
 * Sugiere artículos de KB relevantes para un texto libre (típicamente el
 * título y/o descripción que el usuario está escribiendo al crear un
 * ticket).
 *
 * Diseño:
 *  - Solo lectura, autenticado.
 *  - Tokeniza la query y puntúa cada artículo: cada token que aparezca en
 *    `title` suma 3 puntos, en `tags` 2, en `summary` 1.
 *  - Devuelve los 5 mejores con score > 0.
 *  - Si la query es < 4 caracteres, devuelve vacío para no spamear con
 *    sugerencias sin sentido.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas",
  "de", "del", "en", "y", "o", "u", "a", "al", "por", "para",
  "con", "sin", "sobre", "se", "que", "es", "son", "está", "esta",
  "el", "the", "and", "of", "in",
]);

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .slice(0, 8);
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión", suggestions: [] }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim().slice(0, 240);
    if (q.length < 4) {
      return NextResponse.json({ q, suggestions: [] });
    }

    const tokens = tokenize(q);
    if (tokens.length === 0) {
      return NextResponse.json({ q, tokens, suggestions: [] });
    }

    // Filtro grueso: artículos publicados que contengan ALGUNO de los tokens
    // en título / tags / summary. Tras esto puntuamos en memoria.
    const articles = await prisma.kbArticle.findMany({
      where: {
        status: "publicado",
        OR: tokens.flatMap((t) => [
          { title: { contains: t } },
          { tags: { contains: t } },
          { summary: { contains: t } },
        ]),
      },
      orderBy: { views: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        tags: true,
        views: true,
        category: { select: { name: true } },
      },
      take: 40,
    });

    type Scored = {
      id: string;
      slug: string;
      title: string;
      summary: string | null;
      category: string | null;
      score: number;
    };
    const lowered = articles.map((a) => ({
      raw: a,
      title: a.title.toLowerCase(),
      tags: (a.tags ?? "").toLowerCase(),
      summary: (a.summary ?? "").toLowerCase(),
    }));

    const scored: Scored[] = lowered
      .map(({ raw, title, tags, summary }) => {
        let score = 0;
        for (const t of tokens) {
          if (title.includes(t)) score += 3;
          if (tags.includes(t)) score += 2;
          if (summary.includes(t)) score += 1;
        }
        return {
          id: raw.id,
          slug: raw.slug,
          title: raw.title,
          summary: raw.summary,
          category: raw.category?.name ?? null,
          score,
        };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return NextResponse.json({ q, tokens, suggestions: scored });
  } catch (error) {
    console.error("Error en /api/kb/suggest:", error);
    return NextResponse.json(
      { message: "No se pudieron calcular sugerencias", suggestions: [] },
      { status: 500 },
    );
  }
}
