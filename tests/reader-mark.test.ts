import assert from "node:assert/strict";
import test from "node:test";
import { resolveReaderMark } from "../lib/reader-mark";

test("overlapping highlights remain editable when discussions cover the same text", () => {
  assert.deepEqual(resolveReaderMark("older newer", "discussion other", [{ id: "older" }, { id: "newer" }], [{ id: "discussion" }, { id: "other" }]), { kind: "highlight", id: "newer", ids: ["older", "newer"] });
});
test("stale and repeated IDs are ignored; discussion IDs are resolved individually", () => {
  assert.deepEqual(resolveReaderMark("gone newer newer", "", [{ id: "newer" }], []), { kind: "highlight", id: "newer", ids: ["newer"] });
  assert.deepEqual(resolveReaderMark("gone", "old latest", [], [{ id: "old" }, { id: "latest" }]), { kind: "gloss", id: "latest" });
  assert.equal(resolveReaderMark(undefined, "gone", [], []), null);
});
