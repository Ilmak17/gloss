import assert from "node:assert/strict";
import { test } from "node:test";
import { marginNoteLayout } from "../lib/margin-note-layout";

test("a note sits beside the page when the margin can hold it", () => {
  assert.deepEqual(marginNoteLayout(270), { mode: "margin", width: 222 });
  assert.deepEqual(marginNoteLayout(268), { mode: "margin", width: 220 });
});

test("a wide margin does not stretch the note", () => {
  assert.deepEqual(marginNoteLayout(600), { mode: "margin", width: 300 });
});

test("a narrow margin opens the note over the page instead of moving the text", () => {
  assert.deepEqual(marginNoteLayout(267), { mode: "overlay" });
  assert.deepEqual(marginNoteLayout(0), { mode: "overlay" });
});
