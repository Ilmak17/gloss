import type { HeardWord } from "./speech";

/** Wraps raw 16-bit mono PCM in a WAV header, so browsers and the transcriber can read it. */
export function pcmToWav(pcm: Uint8Array, rate: number): Buffer {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

/** The words of the final `done` event in Speko's transcription stream. */
export function heardWords(stream: string): HeardWord[] {
  for (const event of stream.split(/\r?\n\r?\n/)) {
    if (!/^event: ?done$/m.test(event)) continue;
    const data = event.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trimStart()).join("\n");
    try { const words = JSON.parse(data).words; return Array.isArray(words) ? words : []; } catch { return []; }
  }
  return [];
}
