import { blockText, type Article } from "./article";
import type { BookChapter } from "./books";
import { keepInRotation } from "./review";
import type { Gloss } from "./store";

/**
 * A recap at the end of a chapter: the reader says what they took from it,
 * in their own words, before the next one begins. Only the book's own
 * chapters ask for one, and only those long enough to have a main idea.
 */

/** About four pages. Shorter sections (a preface, an interlude) are read straight through. */
const MIN_WORDS = 1000;

const wordCount = (chapter: BookChapter) =>
  chapter.blocks.reduce((n, b) => n + blockText(b).split(/\s+/).filter(Boolean).length, 0);

/** The chapters that end in a recap, by index. A book with a contents list marks its own chapters there. */
export function recapChapters(doc: Article, chapters: BookChapter[]): number[] {
  const kinds = new Map(doc.epub?.toc.map((t) => [t.block, t.kind]) ?? []);
  return chapters.flatMap((c, i) => {
    const first = c.blocks[0]?.id;
    if (kinds.size ? kinds.get(first) !== "main" : i === 0) return [];
    return wordCount(c) >= MIN_WORDS ? [i] : [];
  });
}

/** How a recap is told apart from other thoughts: it is saved as this request. */
export const RECAP_QUESTION = "Recap this chapter in my own words.";
export const isRecap = (g: Gloss) => g.question === RECAP_QUESTION;

/** The reader's recap of a chapter, if they wrote one. */
export function chapterRecap(glosses: Gloss[], chapter: BookChapter): Gloss | undefined {
  const first = chapter.blocks[0]?.id;
  return glosses.findLast((g) => isRecap(g) && g.at === first);
}

/**
 * A recap is a thought like any other: kept with the chapter's first line,
 * listed in the notebook, and enrolled in the review, where the chapter
 * title is the prompt and the recap is the answer to recall.
 */
export function recapThought(o: { id: string; articleId: string; chapter: BookChapter; text: string; now: number }): Gloss {
  return {
    id: o.id,
    articleId: o.articleId,
    destination: "codex",
    at: o.chapter.blocks[0]?.id,
    action: "ask",
    question: RECAP_QUESTION,
    reflection: { claim: o.chapter.title, takeaway: o.text.trim() },
    review: keepInRotation({}, o.now),
    turns: [],
    createdAt: o.now,
  };
}

/** What "Copy for Codex" puts on the clipboard: the request, the reader's recap, and the chapter itself. */
export function recapHandoff(o: { book: string; chapter: BookChapter; recap: string }): string {
  const body = o.chapter.blocks.map(blockText).filter((t) => t.trim()).join("\n\n");
  return [
    `${o.book} — ${o.chapter.title}`,
    "I just finished this chapter and wrote a recap from memory. Check my understanding: ask me 2–3 questions about its main idea, one at a time, then tell me what I missed or misunderstood. Let's discuss in English.",
    `My recap:\n${o.recap.trim()}`,
    `The chapter:\n${body}`,
  ].join("\n\n");
}
