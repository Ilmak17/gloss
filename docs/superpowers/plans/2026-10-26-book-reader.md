# Book Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EPUB books comfortable to read a page at a time, with separate article import and reading.
**Architecture:** A dedicated BookReader shares the existing document index, annotations, study panel and audio engine. CSS columns paginate one mounted chapter; source block/character anchors survive reflow. Pure book helpers handle classification, chapters and progress, while DOM helpers map anchors to pages.
**Tech Stack:** Existing Next.js, React, TypeScript, Zustand, CSS columns; no new dependencies.
**Spec:** docs/superpowers/specs/2026-10-26-book-reader.md

## Global Constraints
- English UI; Michael remains selected.
- Existing documents, annotations and audio must survive.
- Mount only the current EPUB chapter.
- No automatic paid prefetch.
- PDF keeps its existing extracted-text view in this iteration.

## Review Focus
- Long paragraphs spanning pages must preserve source offsets and highlight the correct word (task 2 browser check).
- Resizing or changing font must retain the same text anchor (task 2 browser check).
- A chapter boundary during narration must mount the next chapter without restarting the clip (task 3 browser check).
- Opening Discuss and closing it must leave the page in place (task 3 browser check).
- Old EPUB/PDF library entries without format metadata must remain discoverable (task 1 tests).

### Task 1: Document classification and book anchors
**Files:** lib/books.ts, lib/article.ts, lib/store.ts, lib/epub.ts, lib/import.ts, tests/books.test.ts
**Interfaces:** documentKind(document): 'book'|'article'; isPagedBook(article): boolean; bookChapters(article): BookChapter[]; chapterForPoint(chapters, point): number; bookProgress(article, point): number. Progress gains an optional offset.
- [ ] Write and run tests for legacy classification, chapter partition coverage, invalid chapter references, long paragraph offsets and document-end progress.
- [ ] Add optional format metadata to imported EPUB/PDF and library entries; retain legacy inference.
- [ ] Implement pure chapter and anchor helpers; run targeted tests.

### Task 2: Paginated EPUB reader
**Files:** lib/book-pages.ts, components/reader/BookReader.tsx, components/reader/BookNavigation.tsx, components/reader/Reader.tsx, app/globals.css
**Interfaces:** BookReader({article}); book-pages DOM helpers resolve Point to page and capture page start Point without changing text nodes.
- [ ] Render current chapter in CSS columns inside a fixed viewport, with bounded page buttons, arrow keys and swipe navigation.
- [ ] Save block plus offset, restore after reflow/reload, support chapter-local page count and book percent.
- [ ] Add chapter/search/bookmark navigation and appearance/voice controls using existing popovers.
- [ ] Verify browser pagination, long paragraphs, images, chapter boundaries, reflow restoration and keyboard behavior in text inputs.

### Task 3: Audio and discussion integration
**Files:** lib/listening.ts, components/reader/Listen.tsx, components/reader/context.tsx, tests/listening.test.ts
**Interfaces:** ListenState gains current source offset; startListening optionally accepts fromOffset; ReaderApi optionally exposes paged follow callback.
- [ ] Extend audio start to select the containing cached chunk and seek to its word timing; preserve cache identity.
- [ ] Follow current spoken point across pages/chapters; manual page turns disable follow until Jump to audio.
- [ ] Overlay Discuss without reflow, preserving local draft and resume semantics.
- [ ] Run audio state tests and actual short English smoke with Michael; verify page and word highlight together.

### Task 4: Separate library workflows and delivery
**Files:** components/library/Library.tsx, components/library/AddPanel.tsx, LOCAL.md
- [ ] Add Books/Articles tabs with filtered counts and Add book/Add article actions.
- [ ] Books opens file import; Articles offers URL and pasted text. Preserve metadata and original library entries.
- [ ] Verify both workflows in browser, run npm test, npm run lint, npm run build and git diff --check.
- [ ] Save screenshots; commit verified work and push main/local-study.
