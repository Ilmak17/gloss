import assert from "node:assert/strict";
import { test } from "node:test";
import type { Article } from "../lib/article";
import { bookChapters } from "../lib/books";
import { chapterRecap, recapChapters, recapHandoff, recapThought } from "../lib/recap";
import { todaysThoughts } from "../lib/review";
import { notesMarkdown } from "../lib/export";
import type { Gloss } from "../lib/store";

const words = (n: number) => "word ".repeat(n).trim();
const book: Article = {
  id: "book",
  title: "Book",
  origin: "file",
  format: "epub",
  blocks: [
    { id: "cover", type: "p", runs: [{ text: words(5) }] },
    { id: "intro", type: "h2", runs: [{ text: "Introduction" }] },
    { id: "intro-p", type: "p", runs: [{ text: words(300) }] },
    { id: "one", type: "h2", runs: [{ text: "1. One" }] },
    { id: "one-p", type: "p", runs: [{ text: words(4000) }] },
    { id: "two", type: "h2", runs: [{ text: "2. Two" }] },
    { id: "two-p", type: "p", runs: [{ text: words(2500) }] },
    { id: "index", type: "h2", runs: [{ text: "Index" }] },
    { id: "index-p", type: "p", runs: [{ text: words(5000) }] },
    { id: "loose", type: "h2", runs: [{ text: "Untitled section" }] },
    { id: "loose-p", type: "p", runs: [{ text: words(5000) }] },
  ],
  chapters: [
    { title: "Cover", block: "cover" },
    { title: "Introduction", block: "intro" },
    { title: "1. One", block: "one" },
    { title: "2. Two", block: "two" },
    { title: "Index", block: "index" },
    { title: "Untitled section", block: "loose" },
  ],
  epub: {
    version: 2,
    targets: {},
    toc: [
      { title: "Cover", block: "cover", depth: 0, kind: "front" },
      { title: "Introduction", block: "intro", depth: 0, kind: "main" },
      { title: "1. One", block: "one", depth: 1, kind: "main" },
      { title: "2. Two", block: "two", depth: 1, kind: "main" },
      { title: "Index", block: "index", depth: 0, kind: "back" },
    ],
  },
};

test("only the book's own chapters of some length end in a recap", () => {
  // Front and back matter, a two-page introduction and a section outside the contents are read through.
  assert.deepEqual(recapChapters(book, bookChapters(book)), [2, 3]);
});

test("a saved recap belongs to its chapter and comes back to be recalled", () => {
  const now = new Date(2026, 9, 28, 12).getTime();
  const chapters = bookChapters(book);
  const recap = recapThought({ id: "r", articleId: "book", chapter: chapters[2], text: "  Good explanations reach far.  ", now });
  const question: Gloss = { id: "q", articleId: "book", destination: "codex", at: "one", action: "ask", question: "Why?", turns: [], createdAt: now };
  assert.equal(chapterRecap([question, recap], chapters[2])?.reflection?.takeaway, "Good explanations reach far.");
  assert.equal(chapterRecap([question, recap], chapters[3]), undefined);
  assert.equal(chapterRecap([question], chapters[2]), undefined);
  // Not the same day: it first comes back three days later, like any thought kept in rotation.
  assert.deepEqual(todaysThoughts([recap], now).deck, []);
  assert.equal(todaysThoughts([recap], now + 3 * 86_400_000).deck[0]?.id, "r");
});

test("the Codex handoff asks to be checked, then gives the recap and the whole chapter", () => {
  const chapter = { title: "2. Two", blocks: [
    { id: "two", type: "h2" as const, runs: [{ text: "2. Two" }] },
    { id: "a", type: "p" as const, runs: [{ text: "First paragraph." }] },
    { id: "b", type: "p" as const, runs: [{ text: "Second " }, { text: "paragraph.", em: true }] },
  ] };
  const text = recapHandoff({ book: "Book", chapter, recap: "  My recap.  " });
  assert.match(text, /^Book — 2\. Two\n/);
  const ask = text.indexOf("2–3 questions"), recap = text.indexOf("My recap."), body = text.indexOf("First paragraph.\n\nSecond paragraph.");
  assert.ok(ask > 0 && recap > ask && body > recap, text);
  assert.match(text, /in English/);
  assert.match(text, /missed or misunderstood/);
});

test("exported notes give a recap under its chapter, in the reader's words", () => {
  const chapters = bookChapters(book);
  const recap = recapThought({ id: "r", articleId: "book", chapter: chapters[2], text: "Good explanations reach far.", now: 0 });
  const md = notesMarkdown({ title: "Book" }, [recap], []);
  assert.match(md, /## Recap: 1\. One\n\nGood explanations reach far\.\n/);
  assert.doesNotMatch(md, /Recap this chapter in my own words|My provisional conclusion/);
});
