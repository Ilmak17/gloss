import assert from "node:assert/strict";
import test from "node:test";
import { createPageSwipe } from "../lib/page-swipe";

const wheel = (deltaX: number, deltaY = 0, deltaMode = 0) => ({ deltaX, deltaY, deltaMode });

test("one trackpad swipe turns once, including a long momentum tail across chapters", () => {
  const swipe = createPageSwipe();
  const turns = [20, 25, 40, 100, 70, 40, 20, 10, -5].map((x, i) => swipe(wheel(x), i * 70).direction);
  assert.deepEqual(turns.filter(Boolean), [1]);
  assert.equal(swipe(wheel(-80), 900).direction, -1);
});

test("vertical scrolling, tiny drift and pinch zoom do not turn pages", () => {
  const swipe = createPageSwipe();
  assert.equal(swipe(wheel(8, 80), 0).handled, false);
  assert.equal(swipe(wheel(25), 300).direction, 0);
  assert.equal(swipe(wheel(25), 600).direction, 0);
  assert.equal(swipe({ ...wheel(100), ctrlKey: true }, 900).handled, false);
  assert.equal(swipe(wheel(100), 950).direction, 0);
});

test("selection or open panels block the whole gesture; the next swipe works", () => {
  const swipe = createPageSwipe();
  assert.equal(swipe(wheel(100), 0, true).direction, 0);
  assert.equal(swipe(wheel(100), 50).direction, 0);
  assert.equal(swipe(wheel(100), 300).direction, 1);
});

test("line and page wheel units work and direction changes discard partial motion", () => {
  assert.equal(createPageSwipe()(wheel(4, 0, 1), 0).direction, 1);
  assert.equal(createPageSwipe()(wheel(-1, 0, 2), 0).direction, -1);
  const swipe = createPageSwipe();
  swipe(wheel(45), 0);
  assert.equal(swipe(wheel(-40), 30).direction, 0);
  assert.equal(swipe(wheel(-25), 60).direction, -1);
});
