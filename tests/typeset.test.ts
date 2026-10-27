import assert from "node:assert/strict";
import { test } from "node:test";
import type { Article } from "../lib/article";
import { readingLang, typesetDashes } from "../lib/typeset";

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

const doc = (text: string, lang?: string): Article => ({ id: "t", title: "T", lang, blocks: [{ id: "b1", type: "p", runs: [{ text }] }] });

test("text is set in the language its book declares", () => {
  assert.equal(readingLang(doc("Kreide ist eine Geschichte der Erde", "de")), "de");
});

test("a text saved before languages were kept reads as Russian when it is written in Cyrillic", () => {
  assert.equal(readingLang(doc("Если бы прямо у нас под ногами вырыли колодец")), "ru");
  assert.equal(readingLang(doc("Chalk is a history of the earth, and СССР is a word in it")), undefined);
});
