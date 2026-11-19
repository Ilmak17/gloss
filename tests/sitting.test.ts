import assert from "node:assert/strict";
import { test } from "node:test";
import type { Article } from "../lib/article";
import { lastSitting, recallHandoff, recallThought, sittingStart } from "../lib/sitting";
import { bookChapters } from "../lib/books";
import { chapterRecap } from "../lib/recap";
import { todaysThoughts } from "../lib/review";
import { notesMarkdown } from "../lib/export";

const HOUR = 3_600_000;
const now = Date.UTC(2026, 10, 20, 9);
const words = (n: number, w = "word") => `${w} `.repeat(n).trim();
const book: Article = {
  id: "book",
  title: "Book",
  origin: "file",
  format: "epub",
  blocks: [
    { id: "one", type: "h2", runs: [{ text: "1. One" }] },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `one-a${i}`, type: "p" as const, runs: [{ text: words(250, "alpha") }] })),
    { id: "one-b", type: "p", runs: [{ text: `Before the stop. ${words(300, "beta")}` }] },
    { id: "two", type: "h2", runs: [{ text: "2. Two" }] },
    { id: "two-a", type: "p", runs: [{ text: `${words(200, "gamma")} Read up to here. Not yet read.` }] },
  ],
  chapters: [
    { title: "1. One", block: "one" },
    { title: "2. Two", block: "two" },
  ],
};
const stop = book.blocks.find(b => b.id === "two-a")!.runs[0].text.indexOf(" Not yet read.");

test("back after a break, the stretch read in the last sitting is offered for recall", () => {
  const last = lastSitting(book, { block: "two-a", offset: stop, pct: .9, at: now - 5 * HOUR, from: { block: "one-b", offset: 17 } }, now);
  assert.ok(last);
  assert.equal(last.label, "1. One – 2. Two");
  assert.ok(last.text.startsWith("beta beta"), "from where the sitting began");
  assert.ok(last.text.includes("2. Two"), "headings come along");
  assert.ok(last.text.endsWith("Read up to here."), "up to where the reader stopped");
  assert.ok(!last.text.includes("alpha"));
});

test("nothing to recall after a short break, or when hardly anything was read", () => {
  const read = { block: "two-a", offset: stop, pct: .9, from: { block: "one-b", offset: 17 } };
  assert.equal(lastSitting(book, { ...read, at: now - 1 * HOUR }, now), null, "the same sitting goes on");
  assert.equal(lastSitting(book, { ...read, at: now - 5 * HOUR, from: { block: "two-a", offset: 0 } }, now), null, "one paragraph is not worth a recall");
});

test("progress saved before sittings were kept: the last few pages stand in for the last sitting", () => {
  const last = lastSitting(book, { block: "two-a", offset: stop, pct: .9, at: now - 30 * HOUR }, now);
  assert.ok(last);
  assert.ok(last.text.endsWith("Read up to here."));
  const n = last.text.split(/\s+/).length;
  assert.ok(n >= 1500 && n < 1800, `about the last six pages, not the whole book (${n} words)`);
});

test("a sitting that began past where the reader stopped (a look ahead, then back) falls back to the last pages", () => {
  const last = lastSitting(book, { block: "one-b", offset: 17, pct: .5, at: now - 5 * HOUR, from: { block: "two-a" } }, now);
  assert.ok(last);
  assert.ok(last.text.endsWith("Before the stop."));
  assert.equal(last.label, "1. One");
});

test("a new sitting begins where the last one stopped; within a sitting, its start is kept", () => {
  const saved = { block: "two-a", offset: stop, pct: .9, at: now - 5 * HOUR, from: { block: "one-b", offset: 17 } };
  assert.deepEqual(sittingStart(saved, now), { block: "two-a", offset: stop });
  assert.deepEqual(sittingStart({ ...saved, at: now - HOUR }, now), { block: "one-b", offset: 17 });
  assert.deepEqual(sittingStart({ ...saved, at: now - HOUR, from: undefined }, now), { block: "two-a", offset: stop });
  assert.equal(sittingStart(undefined, now), null, "a book opened for the first time begins wherever it opens");
});

test("the recall goes to Codex with what was read: checked when written, retold when not", () => {
  const last = { label: "2. Two", text: "The text read last time." };
  const checked = recallHandoff({ book: "Book", ...last, recall: "  It was about gamma.  " });
  assert.match(checked, /^Book — 2\. Two\n/);
  assert.match(checked, /what I got right/);
  assert.match(checked, /My recall:\nIt was about gamma\.\n/);
  assert.ok(checked.endsWith("What I read last time:\nThe text read last time."));
  const retold = recallHandoff({ book: "Book", ...last, recall: " " });
  assert.match(retold, /TL;DR/);
  assert.doesNotMatch(retold, /My recall/);
});

test("a saved recall is a notebook entry that comes back for review, and is never taken for a chapter recap", () => {
  const g = recallThought({ id: "r", articleId: "book", at: "two", label: "2. Two", recall: " It was about gamma. ", now });
  assert.equal(g.reflection?.claim, "2. Two");
  assert.equal(g.reflection?.takeaway, "It was about gamma.");
  assert.equal(chapterRecap([g], bookChapters(book)[1]), undefined);
  assert.deepEqual(todaysThoughts([g], now + 4 * 24 * HOUR).deck.map((x) => x.id), ["r"]);
  assert.match(notesMarkdown({ title: "Book" }, [g], []), /## Last time: 2\. Two\n\nIt was about gamma\.\n/);
});
