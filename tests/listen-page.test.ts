import assert from "node:assert/strict";
import { test } from "node:test";
import { pageSpeech, pageSpeechPoint } from "../lib/listen-page";
import { assemblePageAudio } from "../lib/page-audio";
import type { Block } from "../lib/article";

const blocks: Block[] = [
  { id: "title", type: "h2", runs: [{ text: "Heading" }] },
  { id: "p1", type: "p", runs: [{ text: "Before. First page. After." }] },
  { id: "p2", type: "p", runs: [{ text: "Second paragraph. Next page." }] },
];
test("page speech contains only visible prose and maps words across paragraphs", () => {
  const page = pageSpeech(blocks, { start: { b: "p1", o: 8 }, end: { b: "p2", o: 17 } });
  assert.equal(page.text, "First page. After.\n\nSecond paragraph.");
  assert.deepEqual(pageSpeechPoint(page.spans, 0), { b: "p1", o: 8 });
  assert.deepEqual(pageSpeechPoint(page.spans, page.text.indexOf("paragraph")), { b: "p2", o: 7 });
  assert.equal(pageSpeechPoint(page.spans, page.text.indexOf("\n")), null);
  assert.equal(pageSpeech(blocks, { start: { b: "title", o: 0 }, end: { b: "p1", o: 0 } }).text, "");
  assert.equal(pageSpeech(blocks, { start: { b: "title", o: 0 }, end: { b: "p2", o: 0 } }).text, "Before. First page. After.");
});
test("page audio combines clips into one timed WAV and closes decoder", async t => {
  let closed = false;
  class Decoder {
    sampleRate = 24000;
    async decodeAudioData() { return { duration: 1, length: 24000, numberOfChannels: 1, getChannelData: () => new Float32Array(24000).fill(.5) }; }
    async close() { closed = true; }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Decoder });
  t.after(() => Reflect.deleteProperty(globalThis, "AudioContext"));
  const part = { blob: new Blob(["audio"]), words: [{ start: 0, end: 3, from: .1, to: .8 }], cache: "hit", start: 0 };
  const result = await assemblePageAudio([part, { ...part, start: 10 }]);
  assert.equal(result.blob.type, "audio/wav");
  assert.equal(result.blob.size, 44 + 48000 * 2);
  assert.deepEqual(result.words[1], { start: 10, end: 13, from: 1.1, to: 1.8 });
  assert.equal(result.cache, "hit");
  assert.equal((await assemblePageAudio([{ ...part, cache: "unavailable" }])).cache, "unavailable");
  assert.equal(closed, true);
  const header = new DataView(await result.blob.arrayBuffer());
  assert.equal(header.getUint32(24, true), 24000);
  assert.equal(header.getInt16(44, true), 16384);
  await assert.rejects(assemblePageAudio([part], AbortSignal.abort()), { name: "AbortError" });
});
