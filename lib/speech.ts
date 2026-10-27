export type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
export type TimedWord = { start: number; end: number; from: number; to: number };

/** Match provider words in order; never skip source words or guess normalized numbers. */
export function kokoroWordsWithTiming(text: string, input: unknown): TimedWord[] {
  if (!Array.isArray(input)) return [];
  const result: TimedWord[] = [];
  let cursor = 0, previousTime = 0;
  const harmless = (s: string) => /^[\s\p{P}\p{S}]*$/u.test(s);
  for (const w of input) {
    if (!w || typeof w.text !== "string" || !w.text.trim() || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < previousTime || w.end < w.start) return [];
    const token = w.text.trim();
    const start = text.indexOf(token, cursor);
    if (start < 0 || !harmless(text.slice(cursor, start))) return [];
    const end = start + token.length;
    result.push({ start, end, from: w.start, to: w.end });
    cursor = end;
    previousTime = w.start;
  }
  return harmless(text.slice(cursor)) ? result : [];
}

/** Retain source offsets, including across repeated sentences and surrogate pairs. */
export function speechChunks(text: string, max = 1200): { text: string; start: number; end: number }[] {
  if (max < 2) throw new Error("Speech chunk size must be at least 2.");
  const out = [];
  let start = 0;
  while (start < text.length) {
    while (/\s/.test(text[start] ?? "") && start < text.length) start++;
    if (start === text.length) break;
    let end = Math.min(start + max, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const boundaries = [...slice.matchAll(/[.!?][”’"')]*\s+|\s+/g)];
      const sentence = boundaries.filter(m => /[.!?]/.test(m[0])).at(-1);
      const boundary = sentence ?? boundaries.at(-1);
      if (boundary && boundary.index! > 0) end = start + boundary.index! + boundary[0].length;
      else if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    while (end > start && /\s/.test(text[end - 1])) end--;
    out.push({ text: text.slice(start, end), start, end });
    start = end;
  }
  return out;
}

/** Refuse normalized or mismatched text: guessed offsets would mark the wrong words. */
export function wordsWithTiming(text: string, alignment?: Alignment | null): TimedWord[] {
  if (!alignment || !Array.isArray(alignment.characters) || !Array.isArray(alignment.character_start_times_seconds) || !Array.isArray(alignment.character_end_times_seconds)) return [];
  const { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  if (chars.join("") !== text || chars.length !== starts.length || chars.length !== ends.length) return [];
  const positions: { start: number; end: number; from: number; to: number }[] = [];
  let offset = 0;
  for (let i = 0; i < chars.length; i++) {
    if (typeof chars[i] !== "string" || !chars[i].length || !Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) || starts[i] < 0 || ends[i] < starts[i] || (i && starts[i] < starts[i - 1])) return [];
    positions.push({ start: offset, end: offset + chars[i].length, from: starts[i], to: ends[i] });
    offset += chars[i].length;
  }
  return [...text.matchAll(/\S+/gu)].map(m => {
    const start = m.index!, end = start + m[0].length;
    return { start, end, from: positions.find(p => p.end > start)!.from, to: positions.find(p => p.end >= end)!.to };
  });
}

/** Words that end in a full stop without ending the sentence: titles, common short forms, initials. */
const SHORT_FORM = /(?:^|[\s(“"‘'«])(?:Mr|Mrs|Ms|Dr|Prof|St|Mt|Sr|Jr|vs|etc|cf|No|Vol|pp?|ch|fig|e\.g|i\.e|\p{Lu})\.$/u;

/**
 * Where each sentence of a passage starts, as offsets into it. A sentence ends
 * at . ! ? or … (with any closing quotes or brackets) followed by a space and
 * a word that is not lowercase, unless the stop belongs to a title, a short
 * form or an initial ("Dr.", "etc.", "J. R. R.").
 */
export function sentenceStarts(text: string): number[] {
  const first = text.search(/\S/);
  if (first < 0) return [];
  const starts = [first];
  for (const m of text.matchAll(/[.!?…]+[”’"')\]»]*\s+/gu)) {
    const next = m.index + m[0].length;
    if (next >= text.length) break;
    if (/\p{Ll}/u.test(text[next]) || SHORT_FORM.test(text.slice(Math.max(0, m.index - 6), m.index + 1))) continue;
    starts.push(next);
  }
  return starts;
}

/** Seconds into a sentence after which "back" hears it again rather than the one before. */
const RESTART_AFTER = 1.5;

/**
 * Where "back" or "next" goes from the moment being spoken: a time in this
 * passage's audio, or the passage before or after. Back within the first
 * moments of a sentence goes to the previous one, as a player's back button does.
 */
export function sentenceStep({ starts, words, time, direction }: { starts: number[]; words: TimedWord[]; time: number; direction: 1 | -1 }): { seek: number } | { item: 1 | -1 } {
  if (!words.length) return direction > 0 ? { item: 1 } : time > RESTART_AFTER ? { seek: 0 } : { item: -1 };
  const at = words.findLast(w => w.from <= time)?.start ?? 0;
  const timeOf = (offset: number) => words.find(w => w.start >= offset)?.from;
  if (direction > 0) {
    const next = starts.find(s => s > at && timeOf(s) !== undefined);
    return next === undefined ? { item: 1 } : { seek: timeOf(next)! };
  }
  const here = starts.findLast(s => s <= at) ?? 0;
  if (time - (timeOf(here) ?? 0) > RESTART_AFTER) return { seek: timeOf(here) ?? 0 };
  const before = starts.findLast(s => s < here);
  return before === undefined ? { item: -1 } : { seek: timeOf(before) ?? 0 };
}
