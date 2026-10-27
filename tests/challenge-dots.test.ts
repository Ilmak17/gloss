import assert from "node:assert/strict";
import { test } from "node:test";
import { pageDots } from "../lib/challenge-dots";

// A 640px page at x=320; the pages before and after sit 64px away, outside the window.
const stage = { left: 320, right: 960, top: 24 };
const dot = (id: string, left: number, top: number, open = false) => ({ id, left, right: left + 6, top, open });

test("only the dots of the page in view are drawn, placed relative to the page", () => {
  const dots = [dot("before", 320 - 704 - 15, 92), dot("here", 305, 92), dot("after", 960 + 64 - 15, 140)];
  assert.deepEqual(pageDots(stage, dots), [{ id: "here", left: -15, top: 68, open: false }]);
});

test("challenges that start on the same line share one dot, the last one in the text", () => {
  const dots = [dot("older", 305, 92), dot("newer", 305, 93, true), dot("next line", 305, 122)];
  assert.deepEqual(pageDots(stage, dots), [
    { id: "newer", left: -15, top: 69, open: true },
    { id: "next line", left: -15, top: 98, open: false },
  ]);
});
