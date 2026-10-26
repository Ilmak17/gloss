/** Snap a browser caret (UTF-16 offset) to a spoken word, including apostrophes. */
export function listeningWordStart(text: string, offset: number): number | null {
  const at = Math.max(0, Math.min(text.length, offset));
  let previous: number | null = null;
  for (const word of text.matchAll(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)) {
    const start = word.index;
    if (at <= start + word[0].length) return start;
    previous = start;
  }
  return previous;
}
