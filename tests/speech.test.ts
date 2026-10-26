import assert from "node:assert/strict";
import { test } from "node:test";
import { speechChunks, wordsWithTiming, kokoroWordsWithTiming } from "../lib/speech";

test("speech chunks preserve exact source offsets including repeated words and long sentences", () => {
  const text = "  One sentence. One sentence! " + "длинное слово ".repeat(400);
  const parts = speechChunks(text, 120);
  assert.ok(parts.length > 2);
  for (const p of parts) {
    assert.equal(p.text, text.slice(p.start, p.end));
    assert.ok(p.text.length <= 120);
  }
  assert.equal(parts.map(p => p.text).join("").replace(/\s/g, ""), text.replace(/\s/g, ""));
});

test("timed words track UTF-16 source offsets and character timestamps", () => {
  const text = "Hi 🌍 мир";
  const characters = [...text];
  const words = wordsWithTiming(text, {
    characters,
    character_start_times_seconds: characters.map((_, i) => i / 10),
    character_end_times_seconds: characters.map((_, i) => (i + 1) / 10),
  });
  assert.deepEqual(words.map(w => [text.slice(w.start, w.end), w.from, w.to]), [
    ["Hi", 0, 0.2], ["🌍", 0.3, 0.4], ["мир", 0.5, 0.8],
  ]);
});

test("mismatched or malformed alignment never highlights unrelated text", () => {
  assert.deepEqual(wordsWithTiming("Hello", { characters: ["X"], character_start_times_seconds: [0], character_end_times_seconds: [1] }), []);
  assert.deepEqual(wordsWithTiming("X", { characters: ["X"], character_start_times_seconds: [], character_end_times_seconds: [1] }), []);
});


test("Kokoro alignment tolerates punctuation and follows repeated words without shifting offsets", () => {
  const text = "Hello, hello — it's me.";
  const words = ["Hello", "hello", "it", "'", "s", "me"].map((text, i) => ({ text, start: i, end: i + 0.8 }));
  const result = kokoroWordsWithTiming(text, words);
  assert.deepEqual(result.map(w => text.slice(w.start, w.end)), words.map(w => w.text));
  assert.deepEqual(result.map(w => w.start), [0, 7, 15, 17, 18, 20]);
});
test("Kokoro mismatches, omitted words, normalized numbers and invalid times fall back safely", () => {
  assert.deepEqual(kokoroWordsWithTiming("There are 12 books.", [{ text: "There", start: 0, end: 1 }, { text: "are", start: 1, end: 2 }, { text: "twelve", start: 2, end: 3 }]), []);
  assert.deepEqual(kokoroWordsWithTiming("hello world hello", [{ text: "hello", start: 0, end: 1 }, { text: "hello", start: 1, end: 2 }]), []);
  assert.deepEqual(kokoroWordsWithTiming("hello world", [{ text: "hello", start: 0, end: 1 }]), []);
  assert.deepEqual(kokoroWordsWithTiming("hello", [{ text: "hello", start: -1, end: 1 }]), []);
  assert.deepEqual(kokoroWordsWithTiming("hello", [{ text: "hello", start: 1, end: 0 }]), []);
});
