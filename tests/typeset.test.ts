import assert from "node:assert/strict";
import { test } from "node:test";
import { typesetDashes } from "../lib/typeset";

test("a spaced hyphen between words reads as a dash", () => {
  assert.equal(typesetDashes("an end - either in catastrophe"), "an end – either in catastrophe");
  assert.equal(typesetDashes(" - and thus between"), " – and thus between");
  assert.equal(typesetDashes("1914 - 1918"), "1914 – 1918");
});

test("hyphenated words and other hyphens stay as they are", () => {
  assert.equal(typesetDashes("well-known self-evident"), "well-known self-evident");
  assert.equal(typesetDashes("-5 and x-1"), "-5 and x-1");
});

test("typesetting never changes the length, so saved positions still point at the same words", () => {
  const text = "progress - both theoretical - and practical";
  assert.equal(typesetDashes(text).length, text.length);
});
