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
