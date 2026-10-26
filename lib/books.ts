import { blockText, type Article, type Block } from "./article";
import type { Point } from "./store";

type DocumentLike = Pick<Article, "source" | "origin" | "format">;
export function documentKind(doc: DocumentLike): "book" | "article" {
  return doc.format === "epub" ||
    doc.format === "pdf" ||
    /\.(epub|pdf)$/i.test(doc.source ?? "")
    ? "book"
    : "article";
}
export function isPagedBook(doc: Article): boolean {
  return doc.format === "epub" || /\.epub$/i.test(doc.source ?? "");
}
export type BookChapter = { title: string; blocks: Block[] };
export function bookChapters(doc: Article): BookChapter[] {
  if (!doc.blocks.length) return [];
  const starts = new Map<number, string>();
  for (const c of doc.chapters ?? []) {
    const i = doc.blocks.findIndex((b) => b.id === c.block);
    if (i >= 0 && !starts.has(i)) starts.set(i, c.title);
  }
  if (!starts.has(0)) starts.set(0, starts.size ? "Opening" : doc.title);
  const sorted = [...starts].sort((a, b) => a[0] - b[0]);
  return sorted.map(([start, title], i) => ({
    title,
    blocks: doc.blocks.slice(start, sorted[i + 1]?.[0]),
  }));
}
export function chapterForPoint(chapters: BookChapter[], point: Point): number {
  return Math.max(
    0,
    chapters.findIndex((c) => c.blocks.some((b) => b.id === point.b)),
  );
}
export function bookProgress(doc: Article, point: Point): number {
  let total = 0,
    before = 0,
    found = false;
  for (const b of doc.blocks) {
    const len = blockText(b).length;
    if (b.id === point.b) {
      before = total + Math.max(0, Math.min(len, point.o));
      found = true;
    }
    total += len;
  }
  return found && total ? before / total : 0;
}
export function searchBook(
  doc: Article,
  query: string,
): { point: Point; excerpt: string }[] {
  const q = query.trim().toLowerCase(),
    hits: { point: Point; excerpt: string }[] = [];
  if (!q) return hits;
  for (const b of doc.blocks) {
    const text = blockText(b);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const match of text.matchAll(new RegExp(escaped, "giu"))) {
      const at = match.index;
      hits.push({
        point: { b: b.id, o: at },
        excerpt:
          (at > 40 ? "…" : "") +
          text.slice(Math.max(0, at - 40), at + match[0].length + 90),
      });
      if (hits.length === 40) break;
    }
    if (hits.length === 40) break;
  }
  return hits;
}
