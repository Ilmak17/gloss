import { anchorToRange } from "./anchor";
import { blockText, type Block } from "./article";
import type { Point } from "./store";

export const PAGE_GAP = 64;
export const pageStride = (viewport: HTMLElement) =>
  viewport.clientWidth + PAGE_GAP;
export const pageCount = (viewport: HTMLElement) =>
  Math.max(
    1,
    Math.round((viewport.scrollWidth + PAGE_GAP) / pageStride(viewport)),
  );
/** A character range has one column rect even when its paragraph spans many pages. */
export function pageForPoint(viewport: HTMLElement, point: Point): number {
  const el = viewport.querySelector<HTMLElement>(
    `[data-block="${CSS.escape(point.b)}"]`,
  );
  const text = el?.querySelector(".blk-text")?.textContent ?? "";
  const offset = Math.max(0, Math.min(point.o, Math.max(0, text.length - 1)));
  const range = anchorToRange({
    start: { b: point.b, o: offset },
    end: { b: point.b, o: Math.min(text.length, offset + 1) },
  });
  const rect = range?.getClientRects()[0] ?? el?.getClientRects()[0];
  if (!rect) return 0;
  return Math.max(
    0,
    Math.floor(
      (rect.left -
        viewport.getBoundingClientRect().left +
        viewport.scrollLeft +
        1) /
        pageStride(viewport),
    ),
  );
}
export function firstPointOnPage(
  viewport: HTMLElement,
  blocks: Block[],
  page: number,
): Point {
  for (const b of blocks) {
    const len = blockText(b).length;
    if (pageForPoint(viewport, { b: b.id, o: Math.max(0, len - 1) }) < page)
      continue;
    let lo = 0,
      hi = Math.max(0, len - 1);
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (pageForPoint(viewport, { b: b.id, o: mid }) < page) lo = mid + 1;
      else hi = mid;
    }
    return { b: b.id, o: lo };
  }
  const last = blocks.at(-1);
  return { b: last?.id ?? "", o: last ? blockText(last).length : 0 };
}
