import type { Gloss, Highlight, Review } from "./store";

/**
 * The daily review: a few of your own highlights each day, spaced out the way
 * flashcards are. A highlight kept in rotation comes back after 3 days, then
 * a week, two weeks, a month and so on; one marked done never comes back.
 * Everything is derived from the highlights themselves, so it syncs for free.
 */

export const DAILY = 5;
const DAY = 86_400_000;
const STEPS = [3, 7, 16, 35, 75, 160];

const startOfDay = (t = Date.now()) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** A line with some substance reads better than a single marked word. */
const weight = (h: Highlight) => (h.anchor.quote.trim().split(/\s+/).length >= 6 ? 0 : 1);

/** Today's highlights still to see, and how many were already seen today. */
export function todaysReview(all: Highlight[], now = Date.now()): { deck: Highlight[]; done: number } {
  const today = startOfDay(now);
  const tomorrow = today + DAY;
  const done = all.filter((h) => (h.review?.last ?? 0) >= today).length;
  const due = all
    .filter((h) => !h.review?.off && h.createdAt < today && (h.review?.last ?? 0) < today && (h.review?.due ?? 0) < tomorrow)
    .sort((a, b) => weight(a) - weight(b) || (a.review?.due ?? a.createdAt) - (b.review?.due ?? b.createdAt));
  return { deck: due.slice(0, Math.max(0, DAILY - done)), done };
}

/** Seen and kept: it comes back later, each time a little later than the last. */
export function keepInRotation(h: { review?: Review }, now = Date.now()): Review {
  const step = (h.review?.step ?? -1) + 1;
  return { step, last: now, due: startOfDay(now) + STEPS[Math.min(step, STEPS.length - 1)] * DAY };
}

/** Seen and done with: it stays a highlight, but leaves the review. */
export function retire(h: { review?: Review }, now = Date.now()): Review {
  return { step: h.review?.step ?? 0, due: h.review?.due ?? now, last: now, off: true };
}

/** Only explicitly enrolled thoughts with a saved conclusion enter the review deck. */
export function todaysThoughts(all: Gloss[], now = Date.now()): { deck: Gloss[]; done: number } {
  const today = startOfDay(now);
  const enrolled = all.filter(g => g.review && !g.review.off && g.reflection?.takeaway?.trim());
  const done = all.filter(g => g.review && g.review.last >= today && g.reflection?.takeaway?.trim()).length;
  const due = enrolled.filter(g => g.review!.last < today && g.review!.due <= now)
    .sort((a, b) => a.review!.due - b.review!.due);
  return { deck: due.slice(0, Math.max(0, DAILY - done)), done };
}
