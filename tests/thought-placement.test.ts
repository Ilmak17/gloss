import assert from "node:assert/strict";
import { test } from "node:test";
import { placeThought } from "../lib/thought-placement";

// A book page in a laptop window: text from x=300 to x=940.
const column = { left: 300, right: 940, top: 24, bottom: 852 };
const view = { width: 1440, height: 900 };
const passage = [
  { left: 300, right: 930, top: 200, bottom: 222 },
  { left: 300, right: 700, top: 236, bottom: 258 },
];

test("the thought sits in the margin, level with the passage, and the pencil runs along it", () => {
  const place = placeThought({ lines: passage, column, view, minTop: 24 });
  assert.deepEqual(place.card, { mode: "margin", left: 964, top: 200, width: 260, maxHeight: 684 });
  assert.deepEqual(place.rule, { left: 287, top: 200, height: 58, fold: 8 });
});

test("a passage that runs onto the next page draws the pencil only on this page", () => {
  const nextPage = { left: 1004, right: 1600, top: 24, bottom: 46 };
  const place = placeThought({ lines: [...passage, nextPage], column, view, minTop: 24 });
  assert.deepEqual(place.rule, { left: 287, top: 200, height: 58, fold: 8 });
});

test("with the passage off this page there is no pencil, and the thought waits at the top", () => {
  const nextPage = { left: 1004, right: 1600, top: 24, bottom: 46 };
  const place = placeThought({ lines: [nextPage], column, view, minTop: 24 });
  assert.equal(place.rule, null);
  assert.deepEqual(place.card, { mode: "margin", left: 964, top: 24, width: 260, maxHeight: 860 });
  assert.equal(placeThought({ lines: [], column, view, minTop: 24 }).rule, null);
});

test("near the bottom of the window the thought lifts so all of it fits", () => {
  const low = [{ left: 300, right: 900, top: 700, bottom: 722 }];
  const place = placeThought({ lines: low, column, view, minTop: 24, height: 400 });
  assert.deepEqual(place.card, { mode: "margin", left: 964, top: 484, width: 260, maxHeight: 400 });
});

test("a passage scrolled above the window keeps the thought below the top bar", () => {
  const above = [{ left: 300, right: 900, top: -120, bottom: -98 }];
  const place = placeThought({ lines: above, column, view, minTop: 76, height: 300 });
  assert.equal(place.card.mode === "margin" && place.card.top, 76);
});

test("without room in the margin the thought opens over the page, and the pencil still marks the passage", () => {
  const phone = { width: 390, height: 844 };
  const text = { left: 22, right: 368, top: 44, bottom: 794 };
  const place = placeThought({ lines: [{ left: 22, right: 360, top: 300, bottom: 322 }], column: text, view: phone, minTop: 44 });
  assert.deepEqual(place.card, { mode: "overlay" });
  assert.deepEqual(place.rule, { left: 9, top: 300, height: 22, fold: 8 });
});

test("closing folds the pencil into a dot in the middle of the passage's first line", () => {
  const place = placeThought({ lines: passage, column, view, minTop: 24 });
  assert.equal(place.rule?.fold, 8);
});

test("an article's narrower margin still holds the thought beside the text", () => {
  const article = { left: 474, right: 1174, top: 0, bottom: 860 };
  const place = placeThought({ lines: [{ left: 474, right: 1130, top: 412, bottom: 442 }], column: article, view: { width: 1440, height: 860 }, minTop: 76 });
  assert.deepEqual(place.card, { mode: "margin", left: 1198, top: 412, width: 218, maxHeight: 432 });
});
