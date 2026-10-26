import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookChapters,
  chapterForPoint,
  documentKind,
  isPagedBook,
  bookProgress,
  searchBook,
} from "../lib/books";
import type { Article } from "../lib/article";
const book: Article = {
  id: "book",
  title: "Book",
  origin: "file",
  source: "Book.EPUB",
  blocks: [
    { id: "front", type: "p", runs: [{ text: "Preface." }] },
    { id: "h1", type: "h2", runs: [{ text: "One" }] },
    { id: "p1", type: "p", runs: [{ text: "A long paragraph. ".repeat(600) }] },
    { id: "h2", type: "h2", runs: [{ text: "Two" }] },
    { id: "p2", type: "p", runs: [{ text: "Last paragraph." }] },
  ],
  chapters: [
    { title: "One", block: "h1" },
    { title: "Two", block: "h2" },
  ],
};
test("legacy books classify without treating text files and web articles as EPUBs", () => {
  assert.equal(documentKind(book), "book");
  assert.equal(isPagedBook(book), true);
  assert.equal(documentKind({ source: "paper.PDF", origin: "file" }), "book");
  assert.equal(
    isPagedBook({ ...book, source: "paper.pdf", chapters: undefined }),
    false,
  );
  assert.equal(documentKind({ source: "notes.md", origin: "file" }), "article");
  assert.equal(
    documentKind({ source: "example.com", origin: "url" }),
    "article",
  );
});
test("chapter partitions cover every block exactly once, including front matter and invalid entries", () => {
  const chapters = bookChapters({
    ...book,
    chapters: [
      ...book.chapters!,
      { title: "Duplicate", block: "h1" },
      { title: "Missing", block: "missing" },
    ],
  });
  assert.deepEqual(
    chapters.flatMap((c) => c.blocks.map((b) => b.id)),
    book.blocks.map((b) => b.id),
  );
  assert.equal(chapters.length, 3);
  assert.equal(chapterForPoint(chapters, { b: "p2", o: 3 }), 2);
  assert.equal(chapterForPoint(chapters, { b: "lost", o: 0 }), 0);
});
test("progress uses character offsets within a long paragraph and reaches the end", () => {
  assert.equal(bookProgress(book, { b: "front", o: 0 }), 0);
  assert.ok(
    bookProgress(book, { b: "p1", o: 5000 }) >
      bookProgress(book, { b: "p1", o: 5 }),
  );
  assert.equal(bookProgress(book, { b: "p2", o: 15 }), 1);
});
test("search returns exact source offsets, including repeated words, with bounded results", () => {
  const hits = searchBook(book, "PARAGRAPH");
  assert.equal(hits[0].point.b, "p1");
  assert.equal(hits[0].point.o, 7);
  assert.equal(hits.length, 40);
  assert.ok(hits[1].point.o > hits[0].point.o);
  assert.deepEqual(searchBook(book, "  "), []);
});
test("search preserves UTF-16 offsets when Unicode case conversion changes length", () => {
  const doc = {
    ...book,
    blocks: [
      { id: "p", type: "p" as const, runs: [{ text: "İstanbul word" }] },
    ],
  };
  assert.equal(searchBook(doc, "word")[0].point.o, 9);
});
