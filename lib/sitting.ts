import { blockText, type Article } from "./article";
import { bookChapters } from "./books";
import { keepInRotation } from "./review";
import type { Gloss, Progress } from "./store";

/**
 * Sittings: back at a book after a break, the reader first recalls what they
 * read last time. A sitting begins when the book is opened after a break and
 * runs to wherever the reader stops; progress keeps where it began.
 */

/** A break this long starts a new sitting. */
export const SITTING_BREAK = 4 * 3_600_000;
/** About a page: less was hardly read, and there is nothing to recall. */
const MIN_WORDS = 300;
/** With no recorded start (progress saved before sittings were kept), about the last six pages stand in. */
const FALLBACK_WORDS = 1500;

type At = { block: string; offset?: number };

/** The text from one point to another, block by block, headings included. */
function between(doc: Article, from: At, to: At): string {
  const start = doc.blocks.findIndex((b) => b.id === from.block);
  const end = doc.blocks.findIndex((b) => b.id === to.block);
  if (start < 0 || end < start) return "";
  return doc.blocks.slice(start, end + 1).map((b, i) => {
    const t = blockText(b);
    const last = start + i === end;
    return t.slice(i === 0 ? from.offset ?? 0 : 0, last ? to.offset ?? t.length : t.length).trim();
  }).filter(Boolean).join("\n\n");
}

/** The paragraph where the last `count` words before a block begin. */
function wordsBack(doc: Article, block: string, count: number): At {
  let i = doc.blocks.findIndex((b) => b.id === block);
  for (let n = 0; i > 0 && n < count; ) n += blockText(doc.blocks[--i]).split(/\s+/).filter(Boolean).length;
  return { block: doc.blocks[Math.max(0, i)]?.id ?? block };
}

/** Where the sitting under way began, written with progress. After a break, it begins where the last one stopped. */
export function sittingStart(saved: Progress | undefined, now: number): At | null {
  if (!saved) return null;
  if (saved.from && now - saved.at < SITTING_BREAK) return saved.from;
  return { block: saved.block, offset: saved.offset };
}

/** What the last sitting read, once the reader is back after a break. */
export function lastSitting(doc: Article, saved: Progress | undefined, now: number): { label: string; text: string; at: string } | null {
  if (!saved || now - saved.at < SITTING_BREAK) return null;
  const index = (block: string) => doc.blocks.findIndex((b) => b.id === block);
  // A sitting that began past the stop looked ahead and came back: the last pages stand in, as with no start at all.
  const began = saved.from && index(saved.from.block) <= index(saved.block) ? saved.from : null;
  const from = began ?? wordsBack(doc, saved.block, FALLBACK_WORDS);
  const text = between(doc, from, { block: saved.block, offset: saved.offset });
  if (text.split(/\s+/).length < MIN_WORDS) return null;
  const chapters = bookChapters(doc);
  const titleAt = (block: string) => chapters.find((c) => c.blocks.some((b) => b.id === block))?.title ?? "";
  const first = titleAt(from.block), last = titleAt(saved.block);
  return { label: first === last ? first : `${first} – ${last}`, text, at: from.block };
}

/** How a recall of the last sitting is told apart from other thoughts: it is saved as this request. */
export const RECALL_QUESTION = "Recall what I read last time.";
export const isRecall = (g: Gloss) => g.question === RECALL_QUESTION;

/**
 * What "Copy for Codex" puts on the clipboard. With a recall, Codex checks it
 * against the text; without one, it retells the text in short.
 */
export function recallHandoff(o: { book: string; label: string; text: string; recall: string }): string {
  const recall = o.recall.trim();
  return [
    `${o.book} — ${o.label}`,
    recall
      ? "I'm back to this book after a break. Below is what I read last time, and what I remember of it, from memory. Tell me briefly what I got right, what I missed or got wrong, then give me a TL;DR of 3–4 sentences so I can read on. Then ask me one question about the most important idea I missed. Let's discuss in English."
      : "I'm back to this book after a break and don't want to lose the thread. Below is what I read last time. Give me a TL;DR of 3–4 sentences, then the three ideas worth keeping, so I can read on. Let's discuss in English.",
    ...(recall ? [`My recall:\n${recall}`] : []),
    `What I read last time:\n${o.text}`,
  ].join("\n\n");
}

/** A recall is kept like a chapter recap: in the notebook at where the sitting began, and in the review. */
export function recallThought(o: { id: string; articleId: string; at: string; label: string; recall: string; now: number }): Gloss {
  return {
    id: o.id,
    articleId: o.articleId,
    destination: "codex",
    at: o.at,
    action: "ask",
    question: RECALL_QUESTION,
    reflection: { claim: o.label, takeaway: o.recall.trim() },
    review: keepInRotation({}, o.now),
    turns: [],
    createdAt: o.now,
  };
}
