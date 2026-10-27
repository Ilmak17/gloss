import assert from "node:assert/strict";
import { test } from "node:test";
import { indexArticle } from "../lib/doc";
import { pinThoughtConclusion } from "../lib/pin-thought";
import { useStore, type Gloss } from "../lib/store";
import { studyContext } from "../lib/study";

const ix = indexArticle({ id: "pin-test", title: "Test book", blocks: [
  { id: "h", type: "h2", runs: [{ text: "Chapter" }] },
  { id: "p", type: "p", runs: [{ text: "An original argument." }] },
] });
const draft = (): Gloss => ({ id: "g", articleId: ix.article.id, action: "ask", question: "Help me critically examine this passage, one question at a time.", at: "h", createdAt: 0, turns: [], reflection: { claim: "My understanding", takeaway: "My conclusion" } });

test("pinning a conclusion preserves unrelated notes, updates its own copy and recovers a deleted pin", t => {
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("Must stay local"); });
  const unrelated = { id: "existing", articleId: ix.article.id, anchor: { start: { b: "p", o: 0 }, end: { b: "p", o: 20 }, quote: "An original argument." }, note: "Keep my note", createdAt: 0 };
  useStore.setState({ glosses: { [ix.article.id]: [draft()] }, highlights: { [ix.article.id]: [unrelated] } });
  const id = pinThoughtConclusion(ix, "g");
  assert.ok(id);
  let highlights = useStore.getState().highlights[ix.article.id];
  assert.equal(highlights.length, 2);
  assert.deepEqual(highlights[0], unrelated);
  assert.equal(highlights[1].anchor.start.b, "p");
  assert.equal(highlights[1].note, "My conclusion");
  useStore.getState().updateGloss(ix.article.id, "g", g => ({ ...g, reflection: { ...g.reflection, takeaway: "Revised conclusion" } }));
  assert.equal(pinThoughtConclusion(ix, "g"), id);
  highlights = useStore.getState().highlights[ix.article.id];
  assert.equal(highlights.length, 2);
  assert.equal(highlights[1].note, "Revised conclusion");
  assert.equal(useStore.getState().glosses[ix.article.id][0].reflection?.claim, "My understanding");
  useStore.getState().removeHighlight(ix.article.id, id);
  const replacement = pinThoughtConclusion(ix, "g");
  assert.ok(replacement);
  assert.notEqual(replacement, id);
  assert.equal(useStore.getState().highlights[ix.article.id].length, 2);
  assert.equal(network.mock.callCount(), 0);
});

test("blank conclusions cannot create notes", () => {
  useStore.setState({ glosses: { [ix.article.id]: [{ ...draft(), reflection: { takeaway: "  " } }] }, highlights: {} });
  assert.equal(pinThoughtConclusion(ix, "g"), null);
  assert.deepEqual(useStore.getState().highlights, {});
});

test("Codex handoff requests English and preserves the original source and thoughts", () => {
  const packet = studyContext(ix, { ...draft(), at: "p" });
  assert.match(packet, /in English/);
  assert.match(packet, /An original argument\./);
  assert.match(packet, /My understanding/);
  assert.match(packet, /My conclusion/);
});
