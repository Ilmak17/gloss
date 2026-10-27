import assert from "node:assert/strict";
import { test } from "node:test";
import { speechChunks, wordsWithTiming, kokoroWordsWithTiming, sentenceStarts, sentenceStep } from "../lib/speech";

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

test("sentences start after their ending punctuation, closing quotes included", () => {
  const text = "  One. Two? He said “Stop.” Then he left… Она ушла.";
  assert.deepEqual(sentenceStarts(text).map(i => text.slice(i, i + 4)), ["One.", "Two?", "He s", "Then", "Она "]);
});

test("abbreviations, initials and lowercase continuations do not end a sentence", () => {
  const text = "Mr. Smith met Dr. Jones and J. R. R. Tolkien, etc. and then left. Next one.";
  assert.deepEqual(sentenceStarts(text).map(i => text.slice(i, i + 4)), ["Mr. ", "Next"]);
});

// "One two. Three four. Five." spoken: each word's text offsets and the second it starts.
const spoken = [
  { start: 0, end: 3, from: 0, to: .4 }, { start: 4, end: 8, from: .5, to: .9 },
  { start: 9, end: 14, from: 1, to: 1.4 }, { start: 15, end: 20, from: 1.5, to: 1.9 },
  { start: 21, end: 26, from: 4, to: 4.5 },
];
const step = (time: number, direction: 1 | -1, words = spoken) => sentenceStep({ starts: [0, 9, 21], words, time, direction });

test("back goes to the previous sentence, or to the start of a sentence well under way", () => {
  assert.deepEqual(step(1.6, -1), { seek: 0 });
  assert.deepEqual(step(2.8, -1), { seek: 1 }, "1.8 s into a sentence, back hears it again from its start");
  assert.deepEqual(step(.6, -1), { item: -1 }, "the first sentence steps back into the passage before");
});

test("next goes to the following sentence, or on to the next passage", () => {
  assert.deepEqual(step(1.2, 1), { seek: 4 });
  assert.deepEqual(step(4.1, 1), { item: 1 });
});

test("without word timings, back restarts the passage or steps before it, and next moves on", () => {
  assert.deepEqual(step(3, -1, []), { seek: 0 });
  assert.deepEqual(step(1, -1, []), { item: -1 });
  assert.deepEqual(step(1, 1, []), { item: 1 });
});
