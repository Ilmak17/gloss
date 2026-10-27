import assert from "node:assert/strict";
import { test } from "node:test";
import { keepInRotation, retire, todaysThoughts } from "../lib/review";
import type { Gloss } from "../lib/store";

const now = new Date(2026, 9, 27, 12).getTime();
const day = 86_400_000;
const thought = (overrides: Partial<Gloss> = {}): Gloss => ({ id: "t", articleId: "book", action: "ask", turns: [], createdAt: now - 7 * day, reflection: { claim: "An idea", takeaway: "My view" }, ...overrides });

test("thought review requires explicit enrollment and a conclusion", () => {
  const due = { step: 0, due: now - 1, last: now - 4 * day };
  assert.deepEqual(todaysThoughts([thought(), thought({ review: due, reflection: { claim: "Only a draft" } }), thought({ review: { ...due, off: true } })], now).deck, []);
  assert.equal(todaysThoughts([thought({ review: due })], now).deck.length, 1);
});

test("thoughts reuse highlight intervals and do not return before due", () => {
  const review = keepInRotation({}, now);
  assert.equal(new Date(review.due).getDate(), 30);
  const g = thought({ review });
  assert.equal(todaysThoughts([g], now + 2 * day).deck.length, 0);
  assert.equal(todaysThoughts([g], review.due).deck.length, 1);
  const next = keepInRotation(g, review.due);
  assert.equal(next.step, 1);
  assert.equal(next.due - review.due, 7 * day);
  assert.equal(todaysThoughts([thought({ review: retire(g, review.due) })], now + 100 * day).deck.length, 0);
});

test("review caps the daily deck and includes cards already completed today", () => {
  const due = Array.from({ length: 8 }, (_, i) => thought({ id: String(i), review: { step: 0, due: now - (i + 1) * day, last: now - 10 * day } }));
  const done = thought({ id: "done", review: keepInRotation({}, now) });
  const result = todaysThoughts([...due, done], now);
  assert.equal(result.done, 1);
  assert.equal(result.deck.length, 4);
  assert.equal(result.deck[0].id, "7");
});
