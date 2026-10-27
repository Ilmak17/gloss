/**
 * Display-only typography for book text. Some EPUBs use a spaced hyphen
 * where print uses a dash. The swap is one character for one, so anchors,
 * search offsets and narration timings, which all count characters in the
 * stored text, still land on the same words. Stored text is never changed:
 * narration and its audio cache keep reading the original.
 */
export function typesetDashes(text: string): string {
  return text.includes(" - ") ? text.replaceAll(" - ", " – ") : text;
}
