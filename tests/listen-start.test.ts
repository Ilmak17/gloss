import { test } from "node:test";
import assert from "node:assert/strict";
import { listeningWordStart } from "../lib/listen-start";
test("listening begins at the clicked word rather than halfway through it", () => {
  assert.equal(listeningWordStart("A beautiful explanation.", 8), 2);
  assert.equal(listeningWordStart("A beautiful explanation.", 11), 2);
  assert.equal(listeningWordStart("A beautiful explanation.", 12), 12);
  assert.equal(listeningWordStart("It's a theory.", 3), 0);
});
test("word offsets remain UTF-16 compatible for Unicode and repeated words", () => {
  assert.equal(listeningWordStart("😀 café café", 10), 8);
  assert.equal(listeningWordStart("научное объяснение", 13), 8);
  assert.equal(listeningWordStart("   ", 1), null);
  assert.equal(listeningWordStart("— ?", 1), null);
});
