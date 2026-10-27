/** A margin dot left by a closed challenge, relative to the book page. `open`: its thought is showing. */
export type ChallengeDot = { id: string; left: number; top: number; open: boolean };

/** Dots this close together sit on the same line and read as one. */
const SAME_LINE = 4;

/**
 * The dots to draw beside the book page in view. Block places each dot in the
 * text; pages before and after lie outside the page window, so their dots are
 * left out. Challenges starting on one line share one dot: the last of them in the text.
 */
export function pageDots(
  page: { left: number; right: number; top: number },
  dots: { id: string; left: number; right: number; top: number; open: boolean }[],
): ChallengeDot[] {
  const here = dots.filter(d => d.right > page.left - 32 && d.left < page.right);
  const kept = here.filter((d, i) => !here.slice(i + 1).some(later => Math.abs(later.top - d.top) < SAME_LINE));
  return kept.map(d => ({ id: d.id, left: d.left - page.left, top: d.top - page.top, open: d.open }));
}
