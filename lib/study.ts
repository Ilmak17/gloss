import { bookChapters, chapterForPoint } from "./books";
import type { DocIndex } from "./doc";
import type { Gloss } from "./store";

/** The dock discusses prose, even when the reading cursor is on a heading. */
export function studyBlock(ix: DocIndex, preferred?: string | null): string | undefined {
  const start = preferred ? ix.order.get(preferred) ?? 0 : 0;
  const readable = (id: string) => ix.numbers.has(id) && !!ix.texts.get(id)?.trim();
  return ix.article.blocks.slice(start).find(b => readable(b.id))?.id
    ?? ix.article.blocks.find(b => readable(b.id))?.id;
}

/** A user-initiated handoff, bounded so a book cannot fill the clipboard. */
export function studyContext(ix: DocIndex, gloss: Gloss): string {
  const block = gloss.anchor?.start.b ?? gloss.at;
  const i = block ? ix.order.get(block) ?? 0 : 0;
  const chapters = ix.article.format === "epub" ? bookChapters(ix.article) : [];
  const chapter = block && chapters.length ? chapters[chapterForPoint(chapters,{b:block,o:0})]?.title : undefined;
  const surrounding = ix.article.blocks.slice(Math.max(0, i - 1), i + 2)
    .map(b => ix.texts.get(b.id) ?? "").join("\n\n").slice(0, 6000);
  const turns = gloss.turns.filter(t => t.content).slice(-4)
    .map(t => `${t.role === "user" ? "My question" : "Saved AI answer (verify its claims)"}: ${t.content.slice(0, 2000)}`).join("\n\n");
  return [
    "Help me understand this passage. Explain in Russian: meaning, mechanism, then an example. Go deeper when useful. Distinguish the author's claims from additional knowledge.",
    "This is an excerpt, not the full document. Say what additional context you need if it is insufficient.",
    `Book / article: ${ix.article.title.slice(0, 500)}${ix.article.author ? `\nAuthor: ${ix.article.author.slice(0, 300)}` : ""}`,
    chapter ? `Chapter: ${chapter}` : "",
    `Selected passage:\n${(gloss.anchor?.quote ?? "Question about the whole text").slice(0, 6000)}`,
    `Nearby context (excerpt):\n${surrounding}`,
    `My question: ${(gloss.question?.trim() || "What does the author mean here?").slice(0, 2000)}`,
    turns,
  ].filter(Boolean).join("\n\n");
}
