import { discussionQuestion } from "./discussion-options";
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
  const challenge = discussionQuestion(gloss.question ?? "").mode === "challenge";
  const coaching = challenge
    ? "Discuss this passage with me in Russian, one question at a time. Start with my reconstruction of the author's claim; if I have not provided one, ask me to try before explaining. Check it against the excerpt. Examine my objection fairly, offer the strongest defensible reply, and sometimes ask me to defend the author. Do not reward disagreement for its own sake. Distinguish the actual text, your reconstruction, and outside evidence. Ask for my provisional conclusion and what would change my mind. Later, test the idea with a new example. Do not invent my views or the author's reply."
    : "Help me understand this passage. Explain in Russian: meaning, mechanism, then an example. Go deeper when useful. Distinguish the author's claims from additional knowledge.";
  return [
    coaching,
    "This is an excerpt, not the full document. Say what additional context you need if it is insufficient.",
    `Book / article: ${ix.article.title.slice(0, 500)}${ix.article.author ? `\nAuthor: ${ix.article.author.slice(0, 300)}` : ""}`,
    chapter ? `Chapter: ${chapter}` : "",
    `Selected passage:\n${(gloss.anchor?.quote ?? "Question about the whole text").slice(0, 6000)}`,
    `Nearby context (excerpt):\n${surrounding}`,
    `My question: ${(gloss.question?.trim() || "What does the author mean here?").slice(0, 2000)}`,
    challenge && gloss.reflection?.claim?.trim() ? `My reconstruction of the claim:\n${gloss.reflection.claim.slice(0, 2000)}` : "",
    challenge && gloss.reflection?.takeaway?.trim() ? `My provisional conclusion (not an established fact):\n${gloss.reflection.takeaway.slice(0, 2000)}` : "",
    challenge && gloss.reflection?.openQuestion?.trim() ? `Still unresolved:\n${gloss.reflection.openQuestion.slice(0, 2000)}` : "",
    turns,
  ].filter(Boolean).join("\n\n");
}
