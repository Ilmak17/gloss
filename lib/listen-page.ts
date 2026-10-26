import { blockText, type Block } from "./article";
import type { Point } from "./store";

export const SPOKEN_BLOCKS = new Set<Block["type"]>(["p", "quote", "li", "note"]);
export type PageRange = { start: Point; end: Point };
export type SpeechSpan = { block: string; sourceStart: number; start: number; end: number };
export type PageSpeech = { text: string; spans: SpeechSpan[] };

/** A snapshot of the visible page; end is exclusive, even inside a paragraph. */
export function pageSpeech(blocks: Block[], range: PageRange): PageSpeech {
  const first = blocks.findIndex(b => b.id === range.start.b);
  const last = blocks.findIndex(b => b.id === range.end.b);
  const result: PageSpeech = { text: "", spans: [] };
  if (first < 0 || last < first) return result;
  for (let i = first; i <= last; i++) {
    const b = blocks[i];
    if (!SPOKEN_BLOCKS.has(b.type)) continue;
    const source = blockText(b);
    let start = i === first ? Math.max(0, range.start.o) : 0;
    let end = i === last ? Math.min(source.length, range.end.o) : source.length;
    while (start < end && /\s/.test(source[start])) start++;
    while (end > start && /\s/.test(source[end - 1])) end--;
    if (end <= start) continue;
    if (result.text) result.text += "\n\n";
    const offset = result.text.length;
    result.text += source.slice(start, end);
    result.spans.push({ block: b.id, sourceStart: start, start: offset, end: result.text.length });
  }
  return result;
}

export function pageSpeechPoint(spans: SpeechSpan[], offset: number): Point | null {
  const span = spans.find(s => offset >= s.start && offset < s.end);
  return span ? { b: span.block, o: span.sourceStart + offset - span.start } : null;
}
