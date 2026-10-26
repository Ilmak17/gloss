import test from "node:test";
import assert from "node:assert/strict";
import { makeBackup, parseBackup, withoutSecrets, mergeReadingState, safeSettings, type BackupData } from "../lib/backup-format";
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
