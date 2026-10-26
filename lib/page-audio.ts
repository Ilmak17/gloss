import type { TimedWord } from "./speech";

export type SpeechAudio = { blob: Blob; words: TimedWord[]; cache?: string };
export type PageAudioPart = SpeechAudio & { start: number };

/** Decode each bounded response, then make one seekable track with one exact clock. */
export async function assemblePageAudio(parts: PageAudioPart[], signal?: AbortSignal): Promise<SpeechAudio> {
  signal?.throwIfAborted();
  const words: TimedWord[] = [];
  const cache = parts.some(p => p.cache === "unavailable") ? "unavailable" : parts.every(p => p.cache === "hit") ? "hit" : parts.every(p => p.cache === "hit" || p.cache === "saved") ? "saved" : "disabled";
  if (parts.length === 1) return { ...parts[0], cache };
  const context = new AudioContext({ sampleRate: 24000 });
  try {
    const buffers: AudioBuffer[] = [];
    let duration = 0;
    for (const part of parts) {
      signal?.throwIfAborted();
      const buffer = await context.decodeAudioData(await part.blob.arrayBuffer());
      signal?.throwIfAborted();
      buffers.push(buffer);
      words.push(...part.words.map(w => ({ start: part.start + w.start, end: part.start + w.end, from: duration + w.from, to: duration + w.to })));
      duration += buffer.duration;
    }
    const length = buffers.reduce((n, b) => n + b.length, 0);
    const bytes = new ArrayBuffer(44 + length * 2), view = new DataView(bytes);
    const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    text(0, "RIFF"); view.setUint32(4, 36 + length * 2, true); text(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, context.sampleRate, true); view.setUint32(28, context.sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, length * 2, true);
    let cursor = 44;
    for (const buffer of buffers) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, n) => buffer.getChannelData(n));
      for (let i = 0; i < buffer.length; i++) {
        const sample = Math.max(-1, Math.min(1, channels.reduce((v, c) => v + c[i], 0) / channels.length));
        view.setInt16(cursor, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
        cursor += 2;
      }
    }
    return { blob: new Blob([bytes], { type: "audio/wav" }), words, cache };
  } finally { await context.close(); }
}
