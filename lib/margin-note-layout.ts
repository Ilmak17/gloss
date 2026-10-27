/** Space kept between the note and the text, and between the note and the window edge. */
const GAP = 24;
const MIN_WIDTH = 220;
const MAX_WIDTH = 300;

export type MarginNoteLayout = { mode: "margin"; width: number } | { mode: "overlay" };

/**
 * Where a pinned note goes, given the free space to the right of the page.
 * The text never moves for a note: it sits beside the page when it fits,
 * otherwise it opens over the page on request.
 */
export function marginNoteLayout(room: number): MarginNoteLayout {
  const width = Math.min(MAX_WIDTH, Math.floor(room - 2 * GAP));
  return width >= MIN_WIDTH ? { mode: "margin", width } : { mode: "overlay" };
}
