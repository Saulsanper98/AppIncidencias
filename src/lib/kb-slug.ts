/**
 * Convierte un título a un slug URL-friendly.
 *
 *  - Minúsculas, sin acentos, sin caracteres especiales.
 *  - Espacios ? guiones.
 *  - Multiples guiones consecutivos colapsados.
 *  - Limitado a 80 caracteres.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Genera un slug único a?adiendo sufijo numérico si ya existe.
 * `exists(slug)` debe devolver true si ese slug ya está en BD.
 */
export async function generateUniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || "articulo";
  if (!(await exists(root))) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  // Fallback prácticamente imposible.
  return `${root}-${Date.now()}`;
}
