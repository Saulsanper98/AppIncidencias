import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const cats = await prisma.kbCategory.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { articles: true } } } });
const arts = await prisma.kbArticle.findMany({ orderBy: { updatedAt: "desc" }, select: { title: true, slug: true, status: true, category: { select: { name: true } } } });
console.log("Categorias:");
for (const c of cats) console.log(`  ${c.name} (${c.slug}) - ${c._count.articles} articulos`);
console.log("\nArticulos:");
for (const a of arts) {
  // Hexdump primeros 60 bytes del titulo para confirmar UTF-8
  const buf = Buffer.from(a.title, "utf8");
  console.log(`  [${a.status}] ${a.title} (${a.slug}) cat=${a.category?.name ?? "?"} | bytes_len=${buf.length}`);
}
await prisma.$disconnect();
