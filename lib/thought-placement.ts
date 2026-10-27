export type Box = { left: number; right: number; top: number; bottom: number };

/** Space between the text and the thought, and between the thought and the window edge. */
const GAP = 24;
const MIN_WIDTH = 200;
const MAX_WIDTH = 260;
/** Space kept free at the bottom of the window. */
const EDGE = 16;
/** The pencil line's centre, left of the text. Matches `.challenge-dot` in globals.css. */
const RULE_X = 12;
const RULE_WIDTH = 2;
/** The margin dot a closed challenge leaves. Matches `.challenge-dot`. */
const DOT = 6;

export type ThoughtPlacement = {
  card: { mode: "margin"; left: number; top: number; width: number; maxHeight: number } | { mode: "overlay" };
  /** `fold`: how far below its top the line folds into the margin dot when the thought closes. */
  rule: { left: number; top: number; height: number; fold: number } | null;
};

/**
 * Where a challenge thought goes. The text never moves for it: the thought
 * sits in the margin beside the passage when the margin fits it, otherwise
 * over the page, and a pencil line runs down the passage's left edge.
 * All boxes are in window coordinates.
 */
export function placeThought({ lines, column, view, minTop, height = 0 }: {
  /** The passage's line boxes. */
  lines: Box[];
  /** The text column (on a book, the visible page). */
  column: Box;
  view: { width: number; height: number };
  minTop: number;
  /** The thought's own height, once it has rendered. */
  height?: number;
}): ThoughtPlacement {
  // A book lays its pages side by side; only lines inside the column are on this page.
  const here = lines.filter(l => l.right > column.left && l.left < column.right);
  const first = here.reduce<Box | null>((a, l) => (!a || l.top < a.top ? l : a), null);
  const bottom = Math.max(...here.map(l => l.bottom));
  const width = Math.min(MAX_WIDTH, Math.floor(view.width - column.right - 2 * GAP));
  const cardTop = Math.max(minTop, Math.min(first?.top ?? minTop, view.height - EDGE - height));
  return {
    card: width >= MIN_WIDTH
      ? { mode: "margin", left: column.right + GAP, top: cardTop, width, maxHeight: view.height - EDGE - cardTop }
      : { mode: "overlay" },
    rule: !first ? null : {
      left: column.left - RULE_X - RULE_WIDTH / 2, top: first.top, height: bottom - first.top,
      fold: Math.round((first.bottom - first.top) / 2 - DOT / 2),
    },
  };
}
