import assert from "node:assert/strict";
import { test } from "node:test";
import { speechChunks, wordsWithTiming } from "../lib/speech";

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
