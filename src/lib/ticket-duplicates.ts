import { prisma } from "@/lib/prisma";

export type DuplicateTicketCandidate = {
  id: string;
  title: string;
  busId: string;
  status: string;
  priority: string;
  tipo: string | null;
  subtipo: string | null;
  createdAt: string;
  score: number;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function overlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let hits = 0;
  for (const t of a) if (setB.has(t)) hits += 1;
  return hits / Math.max(a.length, b.length);
}

/**
 * Busca tickets abiertos/en curso similares al borrador que se está creando.
 * Prioriza mismo bus + similitud de título/descripción/tipología.
 */
export async function findDuplicateTicketCandidates(input: {
  busId: string;
  title: string;
  description: string;
  tipo?: string;
  subtipo?: string;
  limit?: number;
}): Promise<DuplicateTicketCandidate[]> {
  const busId = input.busId.trim();
  if (!busId) return [];

  const probeTokens = tokenize(`${input.title} ${input.description} ${input.tipo ?? ""} ${input.subtipo ?? ""}`);
  if (probeTokens.length === 0 && !input.tipo) return [];

  const openStatuses = ["abierto", "en_proceso", "esperando_repuesto"] as const;
  const candidates = await prisma.ticket.findMany({
    where: {
      busId,
      status: { in: [...openStatuses] },
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      title: true,
      busId: true,
      status: true,
      priority: true,
      tipo: true,
      subtipo: true,
      description: true,
      createdAt: true,
    },
  });

  const scored = candidates
    .map((ticket) => {
      const titleTokens = tokenize(`${ticket.title} ${ticket.description} ${ticket.tipo ?? ""} ${ticket.subtipo ?? ""}`);
      let score = overlapScore(probeTokens, titleTokens);
      if (input.tipo && ticket.tipo === input.tipo) score += 0.25;
      if (input.subtipo && ticket.subtipo === input.subtipo) score += 0.15;
      if (input.title.trim().length >= 3 && ticket.title.toLowerCase().includes(input.title.trim().toLowerCase())) {
        score += 0.2;
      }
      return {
        id: ticket.id,
        title: ticket.title,
        busId: ticket.busId,
        status: ticket.status,
        priority: ticket.priority,
        tipo: ticket.tipo,
        subtipo: ticket.subtipo,
        createdAt: ticket.createdAt.toISOString(),
        score: Math.min(1, score),
      };
    })
    .filter((t) => t.score >= 0.35)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, input.limit ?? 5);
}
