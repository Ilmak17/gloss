import assert from "node:assert/strict";
import { test } from "node:test";
import { afterPause, doubtParts, openPrompts, toggleAngle, withDoubtText } from "../lib/challenge-prompts";

test("a fresh challenge asks only the first question", () => {
  assert.equal(openPrompts({}), 1);
});

test("reopening shows every answered prompt and the next one", () => {
  assert.equal(openPrompts({ claim: "Progress happened once." }), 2);
  assert.equal(openPrompts({ claim: "Progress happened once.", doubt: "Only once?" }), 3);
  assert.equal(openPrompts({ stand: "For now I agree." }), 3);
  assert.equal(openPrompts({ claim: "   " }), 1);
});

test("a pause after answering brings the next question, never two at once", () => {
  assert.equal(afterPause(1, { claim: "Progress happened once." }), 2);
  assert.equal(afterPause(2, { claim: "Progress happened once." }), 2);
  assert.equal(afterPause(2, { claim: "x", doubt: "Only once?" }), 3);
  assert.equal(afterPause(1, {}), 1);
  assert.equal(afterPause(3, { claim: "x", doubt: "y", stand: "z" }), 3);
});

test("an angle is a toggle that keeps the reader's own words", () => {
  const picked = toggleAngle("Only once?", "Evidence");
  assert.deepEqual(doubtParts(picked), { angles: ["Evidence"], text: "Only once?" });
  assert.equal(toggleAngle(picked, "Evidence"), "Only once?");
  assert.equal(toggleAngle("", "Limits"), "When might this stop being true?");
});

test("writing keeps the chosen angles and every keystroke, spaces included", () => {
  const picked = toggleAngle(toggleAngle("", "Limits"), "Evidence");
  const typed = withDoubtText(picked, "Only once ");
  assert.deepEqual(doubtParts(typed), { angles: ["Evidence", "Limits"], text: "Only once " });
  assert.deepEqual(doubtParts(withDoubtText(typed, "")), { angles: ["Evidence", "Limits"], text: "" });
});

test("cards written before the margin version show their starter as a chosen angle", () => {
  assert.deepEqual(doubtParts("Only once?\n\nCould something else explain this?"), { angles: ["Alternatives"], text: "Only once?" });
});
