import test from "node:test";
import assert from "node:assert/strict";
import { joinBackup, makeBackup, onlyReadingMoved, parseBackup, splitBackup, withoutSecrets, mergeReadingState, safeSettings, type BackupData } from "../lib/backup-format";
import { localBackupRequest } from "../lib/backup-server";
import { DEFAULT_SETTINGS } from "../lib/settings";
const data = (): BackupData => ({
  state: { library: [{ id: "book", title: "Test", words: 4, origin: "file", addedAt: 1 }], glosses: {}, highlights: {}, briefs: {}, progress: { book: { block: "p1", offset: 2, pct: .3, at: 100 } } },
  docs: [{ id: "book", title: "Test", blocks: [{ id: "p1", type: "p", runs: [{ text: "A test book." }] }] }],
  originals: [{ id: "book", type: "application/epub+zip", base64: "VGVzdA==" }],
  settings: DEFAULT_SETTINGS, bookmarks: { book: [{ point: { b: "p1", o: 2 }, excerpt: "test" }] },
  preferences: { voice: { provider: "kokoro", voiceId: "am_michael" }, rate: 1.2 },
});
test("complete snapshot roundtrips original bytes, anchors and safe preferences", async () => {
  const backup = await makeBackup(data());
  const restored = await parseBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(restored.data, data());
  assert.equal(Buffer.from(restored.data.originals[0].base64, "base64").toString(), "Test");
});
test("corruption and unsupported formats are rejected before restore", async () => {
  const b = await makeBackup(data());
  b.data.state.progress.book.offset = 500;
  await assert.rejects(parseBackup(b), /checksum/);
  await assert.rejects(parseBackup({ ...b, version: 2 }), /supported/);
  const incomplete = data(); incomplete.docs = [];
  await assert.rejects(parseBackup(await makeBackup(incomplete)), /missing/);
});
test("credentials and unknown settings never enter a backup", async () => {
  assert.deepEqual(withoutSecrets({ apiKey: "secret", profile: { token: "secret", voiceId: "michael" } }), { profile: { voiceId: "michael" } });
  const settings = safeSettings({ ...DEFAULT_SETTINGS, apiKey: "secret" } as typeof DEFAULT_SETTINGS);
  assert.equal("apiKey" in settings, false);
});
test("restore is idempotent and preserves newer progress and current notes", () => {
  const current = data().state;
  const old = data().state; old.progress.book.at = 1; old.progress.book.offset = 0;
  const merged = mergeReadingState(current, old);
  assert.deepEqual(merged, current);
  assert.deepEqual(mergeReadingState(merged, old), current);
  old.library.push({ ...old.library[0], id: "second" });
  assert.equal(mergeReadingState(current, old).library.length, 2);
});
test("local endpoint rejects cross-origin requests, public hosts and form submissions", () => {
  const previous = process.env.GLOSS_BACKUP_REPOSITORY;
  process.env.GLOSS_BACKUP_REPOSITORY = "test/private";
  const req = (host: string, origin: string, type = "application/json") => new Request("http://localhost:3100/api/backup", { method: "POST", headers: { host, origin, "content-type": type } });
  try {
    assert.equal(localBackupRequest(req("127.0.0.1:3100", "http://127.0.0.1:3100"), true), true);
    assert.equal(localBackupRequest(req("127.0.0.1:3100", "https://attacker.test"), true), false);
    assert.equal(localBackupRequest(req("attacker.test:3100", "http://attacker.test:3100"), true), false);
    assert.equal(localBackupRequest(req("127.0.0.1:3100", "http://127.0.0.1:3100", "text/plain"), true), false);
  } finally { if (previous === undefined) delete process.env.GLOSS_BACKUP_REPOSITORY; else process.env.GLOSS_BACKUP_REPOSITORY = previous; }
});

const filesOf = async (data: BackupData) => {
  const { index, files } = await splitBackup(await makeBackup(data));
  return { index, files: new Map(files.map(f => [f.path, f.bytes])) };
};
test("the repository keeps each book in its own files and a small index of everything else", async () => {
  const { index, files } = await filesOf(data());
  assert.deepEqual([...files.keys()].sort(), ["books/book.epub", "books/book.json"]);
  assert.equal(Buffer.from(files.get("books/book.epub")!).toString(), "Test", "the original file is kept as itself");
  const text = JSON.stringify(index);
  assert.equal(text.includes("A test book."), false, "no book text in the index");
  assert.equal(text.includes("VGVzdA=="), false, "no original file in the index");
  assert.equal(index.data.state.progress.book.offset, 2);
  // Restoring puts the same library back together.
  const joined = await joinBackup(JSON.parse(text), async path => files.get(path) ?? null);
  assert.deepEqual(joined.data, data());
  assert.equal(joined.sha256, (await makeBackup(data())).sha256, "the very same snapshot, checksum and all");
});
test("moving on in a book rewrites the index only, never the book files", async () => {
  const before = await filesOf(data());
  const moved = data(); moved.state.progress.book = { block: "p1", offset: 9, pct: .5, at: 200 };
  const after = await filesOf(moved);
  for (const [path, bytes] of before.files) assert.deepEqual(after.files.get(path), bytes, path);
  assert.notEqual(after.index.sha256, before.index.sha256);
});
test("a book file that does not match the index is refused", async () => {
  const { index, files } = await filesOf(data());
  const tampered = JSON.parse(Buffer.from(files.get("books/book.json")!).toString());
  tampered.blocks[0].runs[0].text = "Another text.";
  files.set("books/book.json", new TextEncoder().encode(JSON.stringify(tampered)));
  await assert.rejects(joinBackup(index, async path => files.get(path) ?? null), /does not match/);
  await assert.rejects(joinBackup(index, async () => null), /missing/i);
});
test("the index alone is not mistaken for a restorable copy", async () => {
  const { index } = await filesOf(data());
  await assert.rejects(parseBackup(index), /Restore from GitHub/);
});
test("only a new reading position is told apart from new notes, marks and settings", () => {
  const moved = data(); moved.state.progress.book = { block: "p1", offset: 9, pct: .5, at: 200 };
  assert.equal(onlyReadingMoved(data(), moved), true);
  assert.equal(onlyReadingMoved(data(), data()), false, "nothing changed at all");
  const noted = data(); noted.state.highlights.book = [{ id: "h", articleId: "book", anchor: { start: { b: "p1", o: 0 }, end: { b: "p1", o: 1 }, quote: "A" }, createdAt: 1 }];
  assert.equal(onlyReadingMoved(data(), noted), false);
  const marked = data(); marked.bookmarks.book = [];
  assert.equal(onlyReadingMoved(data(), marked), false);
  const styled = data(); styled.settings = { ...styled.settings, size: 24 };
  assert.equal(onlyReadingMoved(data(), styled), false);
});
