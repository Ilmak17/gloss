import type { Article } from "./article";
import type { BriefState, Gloss, Highlight, LibraryItem, Progress } from "./store";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

export type ReadingState = {
  library: LibraryItem[]; glosses: Record<string, Gloss[]>;
  highlights: Record<string, Highlight[]>; briefs: Record<string, BriefState>;
  progress: Record<string, Progress>;
};
export type BackupData = {
  state: ReadingState;
  docs: Article[];
  originals: { id: string; type: string; base64: string }[];
  settings: Settings;
  bookmarks: Record<string, { point: { b: string; o: number }; excerpt: string }[]>;
  preferences: { library?: { paintedCovers: boolean; hiddenSamples: string[] }; rate?: number; voice?: { provider: string; voiceId: string } };
};
export type Backup = { format: "gloss-backup"; version: 1; sha256: string; data: BackupData };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }

/** Credential fields are excluded recursively; arbitrary browser storage is never exported. */
export function withoutSecrets<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, v) => /^(apiKey|accessToken|refreshToken|token|secret|password|authorization|cookie)$/i.test(key) ? undefined : v));
}
export function safeSettings(value: Settings): Settings {
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(k => [k, value[k as keyof Settings] ?? DEFAULT_SETTINGS[k as keyof Settings]])) as Settings;
}
export async function checksum(data: unknown): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export async function makeBackup(data: BackupData): Promise<Backup> {
  const clean = withoutSecrets(data);
  return { format: "gloss-backup", version: 1, sha256: await checksum(clean), data: clean };
}
export async function parseBackup(value: unknown): Promise<Backup> {
  assert(record(value) && value.format === "gloss-backup" && value.version === 1, "This is not a supported Gloss backup.");
  const b = value as unknown as Backup;
  assert(record(b.data) && record(b.data.state), "Missing library data.");
  const d = b.data, s = d.state;
  assert(Array.isArray(s.library) && Array.isArray(d.docs) && Array.isArray(d.originals), "Missing books or original files.");
  for (const key of ["glosses", "highlights", "briefs", "progress"] as const) assert(record(s[key]), `Invalid ${key}.`);
  assert(record(d.bookmarks) && record(d.settings) && record(d.preferences), "Missing reader preferences.");
  const ids = new Set<string>();
  for (const doc of d.docs) {
    assert(doc && typeof doc.id === "string" && typeof doc.title === "string" && Array.isArray(doc.blocks) && !ids.has(doc.id), "Invalid or duplicate document.");
    ids.add(doc.id);
    for (const block of doc.blocks) assert(block && typeof block.id === "string" && typeof block.type === "string", "Invalid text block.");
  }
  for (const item of s.library) assert(item && typeof item.id === "string" && typeof item.title === "string" && ids.has(item.id), "A library text is missing from this backup.");
  const originals = new Set<string>();
  for (const f of d.originals) {
    assert(f && ids.has(f.id) && !originals.has(f.id) && typeof f.type === "string" && typeof f.base64 === "string" && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.base64), "Invalid original book file.");
    originals.add(f.id);
  }
  for (const list of Object.values(s.glosses)) {
    assert(Array.isArray(list), "Invalid discussions.");
    for (const g of list) assert(g && typeof g.id === "string" && typeof g.articleId === "string" && Array.isArray(g.turns), "Invalid discussion.");
  }
  for (const list of Object.values(s.highlights)) {
    assert(Array.isArray(list), "Invalid highlights.");
    for (const h of list) assert(h && typeof h.id === "string" && h.anchor?.start && h.anchor?.end && typeof h.anchor.quote === "string", "Invalid highlight.");
  }
  for (const p of Object.values(s.progress)) assert(p && typeof p.block === "string" && Number.isFinite(p.pct) && Number.isFinite(p.at), "Invalid reading position.");
  for (const list of Object.values(d.bookmarks)) {
    assert(Array.isArray(list), "Invalid bookmarks.");
    for (const mark of list) assert(mark?.point && typeof mark.point.b === "string" && Number.isFinite(mark.point.o) && typeof mark.excerpt === "string", "Invalid bookmark.");
  }
  assert(typeof b.sha256 === "string" && b.sha256 === await checksum(d), "The backup checksum does not match. Nothing has been restored.");
  assert(JSON.stringify(withoutSecrets(d)) === JSON.stringify(d), "Backup contains credential fields.");
  return b;
}

/** Existing notes win conflicts; absent books/notes are added, newer progress wins. */
export function mergeReadingState(current: ReadingState, incoming: ReadingState): ReadingState {
  const lists = <T extends { id: string }>(a: Record<string, T[]>, b: Record<string, T[]>) => {
    const result = { ...a };
    for (const [id, list] of Object.entries(b)) result[id] = [...(a[id] ?? []), ...list.filter(x => !(a[id] ?? []).some(y => x.id === y.id))];
    return result;
  };
  const progress = { ...current.progress };
  for (const [id, p] of Object.entries(incoming.progress)) if (!progress[id] || p.at > progress[id].at) progress[id] = p;
  return {
    library: [...current.library, ...incoming.library.filter(x => !current.library.some(y => x.id === y.id))],
    glosses: lists(current.glosses, incoming.glosses), highlights: lists(current.highlights, incoming.highlights),
    briefs: { ...incoming.briefs, ...current.briefs }, progress,
  };
}
