import assert from "node:assert/strict";
import { test } from "node:test";
import { DISCUSSION_OPTIONS, composeDiscussionQuestion, discussionQuestion } from "../lib/discussion-options";
import { studyContext } from "../lib/study";
import { indexArticle } from "../lib/doc";

test("existing requests stay intact when rendered as compact choices", () => {
  for (const option of DISCUSSION_OPTIONS) {
    const question = composeDiscussionQuestion(option.id, "Why does this matter?");
    const parsed = discussionQuestion(question);
    assert.equal(parsed.mode, option.id);
    assert.equal(parsed.detail, "Why does this matter?");
    assert.equal(composeDiscussionQuestion(parsed.mode, parsed.detail), question);
  }
  assert.deepEqual(discussionQuestion("My own question\nwith formatting"), { mode: "ask", detail: "My own question\nwith formatting" });
  const translation = DISCUSSION_OPTIONS.find(o => o.id === "translate")!;
  assert.deepEqual(discussionQuestion(translation.prompt), { mode: "translate", detail: "" });
});

test("a compact translation choice still sends the full instruction and personal question", () => {
  const ix = indexArticle({ id: "book", title: "Book", blocks: [{ id: "p", type: "p", runs: [{ text: "A selected phrase." }] }] });
  const request = composeDiscussionQuestion("translate", "Explain this idiom.");
  const packet = studyContext(ix, { id: "q", articleId: "book", action: "ask", question: request, destination: "codex", turns: [], createdAt: 0 });
  assert.match(packet, /Translate this passage into Russian/);
  assert.match(packet, /Explain this idiom\./);
  assert.match(packet, /A selected phrase\./);
});

test("challenge handoff coaches before explaining and preserves the reader's own position", () => {
  const ix = indexArticle({ id: "book", title: "Book", blocks: [{ id: "p", type: "p", runs: [{ text: "Knowledge makes progress possible." }] }] });
  const packet = studyContext(ix, {
    id: "debate", articleId: "book", action: "ask", at: "p", destination: "codex", createdAt: 0, turns: [],
    question: composeDiscussionQuestion("challenge", "What about discoveries by accident?"),
    reflection: { claim: "Progress needs explanations.", takeaway: "A recipe may precede an explanation.", openQuestion: "What counts as an explanation?" },
  });
  assert.match(packet, /one question at a time/);
  assert.match(packet, /ask me to try before explaining/);
  assert.match(packet, /Do not reward disagreement/);
  assert.match(packet, /What about discoveries by accident\?/);
  assert.match(packet, /My reconstruction of the claim:\nProgress needs explanations/);
  assert.match(packet, /My provisional conclusion \(not an established fact\)/);
  assert.match(packet, /Still unresolved:\nWhat counts as an explanation/);
});

test("ordinary explanations do not inherit challenge coaching", () => {
  const ix = indexArticle({ id: "book", title: "Book", blocks: [] });
  const packet = studyContext(ix, { id: "q", articleId: "book", action: "explain", question: composeDiscussionQuestion("explain", ""), turns: [], createdAt: 0 });
  assert.match(packet, /meaning, mechanism, then an example/);
  assert.doesNotMatch(packet, /one question at a time/);
});
