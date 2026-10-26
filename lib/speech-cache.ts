/** Local server storage. No source text or credentials are written to disk. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import type { TimedWord } from "./speech";

export type SpeechClip = { audio: string; words: TimedWord[]; mimeType: string };
type CachedClip = { clip: SpeechClip; cache: "hit" | "saved" | "unavailable" };
export function speechCacheKey(parts: { provider: string; model: string; voice: string; text: string; credential: string }) {
  return createHash("sha256").update(JSON.stringify({ version: 1, format: "mp3", speed: 1, ...parts })).digest("hex");
}
const pending = new Map<string, Promise<CachedClip>>();

export async function cachedSpeech(directory: string, key: string, generate: () => Promise<SpeechClip>): Promise<CachedClip> {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid audio cache key.");
  const id = join(directory, `${key}.json`);
  const existing = pending.get(id);
  if (existing) return existing;
  const task = (async (): Promise<CachedClip> => {
    try {
      const record = JSON.parse(await readFile(id, "utf8")) as SpeechClip;
      if (!record.audio || typeof record.audio !== "string" || !Array.isArray(record.words) || record.mimeType !== "audio/mpeg") throw new Error("Invalid saved audio.");
      return { clip: record, cache: "hit" };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Saved audio could not be read. Check the local audio cache before generating again.");
    }
    // Fail before spending credits when the disk is not writable.
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await access(directory, constants.W_OK);
    const clip = await generate();
    const temp = `${id}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(clip), { mode: 0o600, flag: "wx" });
      await rename(temp, id);
      return { clip, cache: "saved" };
    } catch {
      await unlink(temp).catch(() => {});
      return { clip, cache: "unavailable" };
    }
  })();
  pending.set(id, task);
  try { return await task; } finally { if (pending.get(id) === task) pending.delete(id); }
}
