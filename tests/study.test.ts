import assert from "node:assert/strict";
import { test } from "node:test";
import { indexArticle } from "../lib/doc";
import { studyBlock, studyContext } from "../lib/study";
import { buildMessages } from "../lib/prompts";
import { startStudy } from "../lib/study-draft";
import { useStore } from "../lib/store";
import { notesMarkdown } from "../lib/export";

test("discuss paragraph skips a chapter heading and preserves an actual paragraph", () => {
  const ix = indexArticle({ id: "chapter", title: "Book", blocks: [
    { id: "h", type: "h2", runs: [{ text: "Chapter" }] },
    { id: "p", type: "p", runs: [{ text: "The actual argument." }] },
  ] });
  assert.equal(studyBlock(ix, "h"), "p");
  assert.equal(studyBlock(ix, "p"), "p");
});

test("preparing and reopening a Codex question never contacts an AI provider", t => {
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("Study drafts must stay local"); });
  const ix = indexArticle({ id: "local-draft", title: "Draft book", blocks: [{ id: "p1", type: "p", runs: [{ text: "A testable idea." }] }] });
  const anchor = { start: { b: "p1", o: 0 }, end: { b: "p1", o: 15 }, quote: "A testable idea." };
  useStore.setState({ glosses: {}, focusMode: true, notebookOpen: true });
  const id = startStudy(ix, { action: "explain", anchor });
  const saved = useStore.getState().glosses[ix.article.id][0];
  assert.equal(saved.destination, "codex");
  assert.deepEqual(saved.turns, []);
  assert.equal(useStore.getState().activeGloss, id);
  assert.equal(useStore.getState().focusMode, false);
  useStore.getState().updateGloss(ix.article.id, id, g => ({ ...g, question: "Как это проверить экспериментом?" }));
  assert.equal(startStudy(ix, { action: "explain", anchor }), id);
  const reopened = useStore.getState().glosses[ix.article.id];
  assert.equal(reopened.length, 1);
  assert.match(studyContext(ix, reopened[0]), /Как это проверить экспериментом\?/);
  assert.match(notesMarkdown({ title: ix.article.title }, reopened, []), /Как это проверить экспериментом\?/);
  startStudy(ix, { action: "ask", question: "Другой вопрос" });
  assert.equal(useStore.getState().glosses[ix.article.id].length, 2);
  assert.equal(network.mock.callCount(), 0);
});

test("Codex handoff includes selected passage and neighboring context, with bounded history", () => {
  const ix = indexArticle({ id: "book", title: "A book", author: "An author", blocks: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, type: "p" as const, runs: [{ text: `Paragraph ${i}` }] })) });
  const packet = studyContext(ix, { id: "g", articleId: "book", action: "explain", createdAt: 0, anchor: { start: { b: "p2", o: 0 }, end: { b: "p2", o: 4 }, quote: "Para" }, turns: Array.from({ length: 10 }, () => ({ role: "assistant" as const, content: "x".repeat(10000) })) });
  assert.match(packet, /A book/);
  assert.match(packet, /An author/);
  assert.match(packet, /Paragraph 1/);
  assert.match(packet, /Paragraph 2/);
  assert.match(packet, /Paragraph 3/);
  assert.doesNotMatch(packet, /Paragraph 0|Paragraph 4/);
  assert.match(packet, /verify its claims/);
  assert.ok(packet.length < 10000);
});

test("reader answers default to Russian without changing original quoted source", () => {
  const messages = buildMessages({ title: "English book", paras: [{ n: 1, text: "An original idea." }] }, { action: "simplify", quote: "An original idea." });
  assert.match(messages[0].content ?? "", /Answer in Russian by default/);
  assert.match(messages[0].content ?? "", /Preserve quotations in their original language/);
  assert.match(messages.at(-1)!.content ?? "", /An original idea\./);
  assert.doesNotMatch(messages.at(-1)!.content ?? "", /modern English/);
});
