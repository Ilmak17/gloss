import assert from "node:assert/strict";
import { test } from "node:test";
import { indexArticle } from "../lib/doc";
import { studyContext } from "../lib/study";
import { buildMessages } from "../lib/prompts";

test("Codex handoff includes selected passage and neighboring context, with bounded history", () => {
  const ix = indexArticle({ id: "book", title: "A book", author: "An author", blocks: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, type: "p" as const, runs: [{ text: `Paragraph ${i}` }] })) });
  const packet = studyContext(ix, { id: "g", articleId: "book", action: "explain", createdAt: 0, anchor: { start: { b: "p2", o: 0 }, end: { b: "p2", o: 4 }, quote: "Para" }, turns: Array.from({ length: 10 }, () => ({ role: "assistant" as const, content: "x".repeat(10000) })) });
  assert.match(packet, /A book/);
  assert.match(packet, /An author/);
  assert.match(packet, /Paragraph 1/);
  assert.match(packet, /Paragraph 2/);
  assert.match(packet, /Paragraph 3/);
  assert.doesNotMatch(packet, /Paragraph 0|Paragraph 4/);
  assert.match(packet, /нужно проверить/);
  assert.ok(packet.length < 10000);
});

test("reader answers default to Russian without changing original quoted source", () => {
  const messages = buildMessages({ title: "English book", paras: [{ n: 1, text: "An original idea." }] }, { action: "simplify", quote: "An original idea." });
  assert.match(messages[0].content ?? "", /Answer in Russian by default/);
  assert.match(messages[0].content ?? "", /Preserve quotations in their original language/);
  assert.match(messages.at(-1)!.content ?? "", /An original idea\./);
  assert.doesNotMatch(messages.at(-1)!.content ?? "", /modern English/);
});
